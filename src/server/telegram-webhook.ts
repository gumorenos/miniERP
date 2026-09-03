import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  isTelegramChatAllowed,
  isTelegramUserAllowed,
  parseTelegramAllowedChatIds,
  parseTelegramAllowedUserIds,
  telegramDraftButtons,
  telegramDraftText,
  telegramHelpText,
  telegramSourceMessageId,
  type TelegramCaptureButton,
  type TelegramDraftSummary
} from "../domain/telegram";
import { db } from "../db/client";
import { users } from "../db/schema";
import type { AuthUser } from "./auth";
import { confirmCaptureDraft, createCaptureDraft, rejectCaptureDraft, resolveCaptureDraftEntity, type CaptureDraftEntityAction } from "./capture";

export const telegramWebhookPath = "/api/integrations/telegram/webhook";

const telegramIdentifierSchema = z.union([
  z.string().trim().min(1).max(200),
  z.number().int()
]).transform((value) => String(value));

const telegramChatSchema = z.object({ id: telegramIdentifierSchema }).passthrough();
const telegramUserSchema = z.object({ id: telegramIdentifierSchema }).passthrough();
const telegramMessageSchema = z.object({
  message_id: telegramIdentifierSchema,
  chat: telegramChatSchema,
  from: telegramUserSchema.optional(),
  text: z.string().trim().max(4000).optional()
}).passthrough();
const telegramCallbackSchema = z.object({
  id: z.string().trim().min(1).max(200),
  from: telegramUserSchema.optional(),
  data: z.string().trim().max(200).optional(),
  message: telegramMessageSchema.optional()
}).passthrough();
const telegramUpdateSchema = z.object({
  message: telegramMessageSchema.optional(),
  callback_query: telegramCallbackSchema.optional()
}).passthrough();

const callbackDataSchema = z.string().max(64).regex(/^(?:capture:(?:confirm|reject|cc|cp):[0-9a-f-]{36}|capture:ps:[0-9a-f-]{36}:[0-9]{1,2})$/i);
const uuidSchema = z.string().uuid();

type JsonRecord = Record<string, unknown>;

export type TelegramWebhookConfig = {
  botToken: string;
  webhookSecret: string;
  businessId: string;
  userId: string;
  allowedChatIds: Set<string>;
  allowedUserIds: Set<string>;
};

export type TelegramWebhookEvent =
  | { kind: "message"; chatId: string; userId: string; messageId: string; text: string }
  | { kind: "callback"; chatId: string; userId: string; callbackId: string; action: "CONFIRM" | "REJECT" | "CREATE_CUSTOMER" | "CREATE_PRODUCT" | "SELECT_PRODUCT"; draftId: string; optionIndex?: number }
  | { kind: "unsupported"; chatId?: string };

type SendMessage = (
  config: TelegramWebhookConfig,
  chatId: string,
  text: string,
  buttons?: TelegramCaptureButton[]
) => Promise<void>;
type AnswerCallback = (config: TelegramWebhookConfig, callbackId: string) => Promise<void>;

export type TelegramWebhookDependencies = {
  resolveUser?: (config: TelegramWebhookConfig) => Promise<AuthUser | null>;
  createDraft?: typeof createCaptureDraft;
  confirmDraft?: typeof confirmCaptureDraft;
  rejectDraft?: typeof rejectCaptureDraft;
  resolveDraftEntity?: typeof resolveCaptureDraftEntity;
  sendMessage?: SendMessage;
  answerCallback?: AnswerCallback;
};

const chatWindows = new Map<string, { count: number; resetAt: number }>();
const CHAT_RATE_LIMIT = 30;
const CHAT_RATE_WINDOW_MS = 60_000;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function errorResponse(error: string, status: number) {
  return json({ ok: false, type: "ERROR", error }, status);
}

function isUuid(value: string) {
  return uuidSchema.safeParse(value).success;
}

export function readTelegramWebhookConfig(env: Record<string, string | undefined> = process.env): TelegramWebhookConfig {
  return {
    botToken: env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "",
    businessId: env.TELEGRAM_BUSINESS_ID?.trim() ?? "",
    userId: env.TELEGRAM_USER_ID?.trim() ?? "",
    allowedChatIds: parseTelegramAllowedChatIds(env.TELEGRAM_ALLOWED_CHAT_IDS),
    allowedUserIds: parseTelegramAllowedUserIds(env.TELEGRAM_ALLOWED_USER_IDS)
  };
}

export function telegramWebhookConfigReady(config: TelegramWebhookConfig) {
  return config.botToken.length >= 20
    && config.botToken.includes(":")
    && config.webhookSecret.length >= 32
    && isUuid(config.businessId)
    && isUuid(config.userId)
    && config.allowedChatIds.size > 0
    && config.allowedUserIds.size > 0;
}

export function matchesTelegramWebhookSecret(provided: string, expected: string) {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export function parseTelegramCallbackData(value: string) {
  const match = callbackDataSchema.safeParse(value);
  if (!match.success) return null;
  const parts = match.data.split(":");
  const code = parts[1]?.toLowerCase();
  const draftId = parts[2];
  if (!draftId || !isUuid(draftId)) return null;
  if (code === "ps") {
    const optionIndex = Number(parts[3]);
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 9) return null;
    return { action: "SELECT_PRODUCT" as const, draftId, optionIndex };
  }
  if (code === "confirm") return { action: "CONFIRM" as const, draftId };
  if (code === "reject") return { action: "REJECT" as const, draftId };
  if (code === "cc") return { action: "CREATE_CUSTOMER" as const, draftId };
  if (code === "cp") return { action: "CREATE_PRODUCT" as const, draftId };
  return null;
}

export function telegramCallbackData(action: "CONFIRM" | "REJECT" | "CREATE_CUSTOMER" | "CREATE_PRODUCT" | "SELECT_PRODUCT", draftId: string, optionIndex?: number) {
  if (!isUuid(draftId)) return null;
  const code = {
    CONFIRM: "confirm",
    REJECT: "reject",
    CREATE_CUSTOMER: "cc",
    CREATE_PRODUCT: "cp",
    SELECT_PRODUCT: "ps"
  }[action];
  if (action === "SELECT_PRODUCT" && (optionIndex == null || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 9)) return null;
  const value = action === "SELECT_PRODUCT"
    ? `capture:${code}:${draftId}:${optionIndex}`
    : `capture:${code}:${draftId}`;
  return value.length <= 64 ? value : null;
}

export function telegramInlineKeyboard(buttons: TelegramCaptureButton[]) {
  const entries = buttons.flatMap((button) => {
    const callbackData = telegramCallbackData(button.action, button.draftId, button.optionIndex);
    return callbackData ? [{ button, item: { text: button.text, callback_data: callbackData } }] : [];
  });
  if (!entries.length) return undefined;
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  entries.forEach(({ button, item }, index) => {
    const isReviewAction = button.action === "CONFIRM" || button.action === "REJECT";
    const lastRow = keyboard.at(-1);
    if (isReviewAction && lastRow?.length === 1 && entries[index - 1]?.button.action === "CONFIRM") {
      lastRow.push(item);
    } else {
      keyboard.push([item]);
    }
  });
  return { inline_keyboard: keyboard };
}

export function parseTelegramUpdate(value: unknown): TelegramWebhookEvent | null {
  const parsed = telegramUpdateSchema.safeParse(value);
  if (!parsed.success) return null;

  const callback = parsed.data.callback_query;
  if (callback) {
    const chatId = callback.message?.chat.id;
    const callbackData = callback.data ? parseTelegramCallbackData(callback.data) : null;
    if (chatId && callbackData) {
      return {
        kind: "callback",
        chatId,
        userId: callback.from?.id ?? "",
        callbackId: callback.id,
        action: callbackData.action,
        draftId: callbackData.draftId,
        ...(callbackData.optionIndex == null ? {} : { optionIndex: callbackData.optionIndex })
      };
    }
    return { kind: "unsupported", chatId };
  }

  const message = parsed.data.message;
  if (message?.text && message.text.length >= 1) {
    return {
      kind: "message",
      chatId: message.chat.id,
      userId: message.from?.id ?? "",
      messageId: message.message_id,
      text: message.text
    };
  }
  return { kind: "unsupported", chatId: message?.chat.id };
}

function allowChatRequest(chatId: string) {
  const now = Date.now();
  if (chatWindows.size > 5_000) {
    for (const [key, value] of chatWindows) {
      if (value.resetAt <= now) chatWindows.delete(key);
    }
  }
  const current = chatWindows.get(chatId);
  if (!current || current.resetAt <= now) {
    chatWindows.set(chatId, { count: 1, resetAt: now + CHAT_RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= CHAT_RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

async function configuredUser(config: TelegramWebhookConfig): Promise<AuthUser | null> {
  const [row] = await db.select({
    id: users.id,
    businessId: users.businessId,
    email: users.email,
    name: users.name
  }).from(users).where(and(
    eq(users.id, config.userId),
    eq(users.businessId, config.businessId),
    eq(users.active, true)
  )).limit(1);
  return row ?? null;
}

async function telegramApiRequest(config: TelegramWebhookConfig, method: string, body: JsonRecord) {
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null) as { ok?: unknown } | null;
  if (!response.ok || payload?.ok !== true) throw new Error(`Telegram API ${method} failed`);
}

const defaultSendMessage: SendMessage = (config, chatId, text, buttons) => telegramApiRequest(config, "sendMessage", {
  chat_id: chatId,
  text,
  disable_web_page_preview: true,
  ...(telegramInlineKeyboard(buttons ?? []) ? { reply_markup: telegramInlineKeyboard(buttons ?? []) } : {})
});

const defaultAnswerCallback: AnswerCallback = (config, callbackId) => telegramApiRequest(config, "answerCallbackQuery", {
  callback_query_id: callbackId
});

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function responseBody(response: Response): Promise<JsonRecord> {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function draftFromResponse(result: JsonRecord) {
  return result.draft as TelegramDraftSummary | undefined;
}

async function handleMessage(
  event: Extract<TelegramWebhookEvent, { kind: "message" }>,
  config: TelegramWebhookConfig,
  user: AuthUser,
  dependencies: TelegramWebhookDependencies
) {
  const sendMessage = dependencies.sendMessage ?? defaultSendMessage;
  if (/^\/(?:start|help)\b/i.test(event.text)) {
    await sendMessage(config, event.chatId, telegramHelpText());
    return json({ ok: true, type: "INFO" });
  }

  const createDraft = dependencies.createDraft ?? createCaptureDraft;
  const response = await createDraft(new Request("http://minierp.local/api/capture/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      channel: "TELEGRAM",
      conversationKey: event.chatId + ":" + event.userId,
      sourceMessageId: telegramSourceMessageId(event.chatId, event.messageId),
      rawText: event.text
    })
  }), user);
  const result = await responseBody(response);
  if (!response.ok) {
    if (response.status >= 500) throw new Error("No se pudo crear el borrador Telegram");
    await sendMessage(config, event.chatId, "⚠️ " + (stringValue(result.error) || "No se pudo crear el borrador."));
    return json({ ok: true, type: "USER_ERROR" });
  }
  const draft = draftFromResponse(result);
  if (!draft) throw new Error("El servidor no devolvió un borrador válido");
  const buttons = telegramDraftButtons(draft);
  await sendMessage(config, event.chatId, telegramDraftText(draft), buttons);
  return json({ ok: true, type: result.duplicate === true ? "DRAFT_ALREADY_EXISTS" : result.continued === true ? "DRAFT_UPDATED" : "DRAFT_CREATED" });
}

async function handleCallback(
  event: Extract<TelegramWebhookEvent, { kind: "callback" }>,
  config: TelegramWebhookConfig,
  user: AuthUser,
  dependencies: TelegramWebhookDependencies
) {
  const sendMessage = dependencies.sendMessage ?? defaultSendMessage;
  if (event.action === "CREATE_CUSTOMER" || event.action === "CREATE_PRODUCT" || event.action === "SELECT_PRODUCT") {
    const entityAction: CaptureDraftEntityAction = event.action === "SELECT_PRODUCT"
      ? { type: "SELECT_PRODUCT", optionIndex: event.optionIndex ?? -1 }
      : { type: event.action };
    const response = await (dependencies.resolveDraftEntity ?? resolveCaptureDraftEntity)(user, event.draftId, entityAction);
    const result = await responseBody(response);
    if (response.ok) {
      const draft = draftFromResponse(result);
      if (!draft) throw new Error("El servidor no devolvió un borrador válido");
      const message = event.action === "CREATE_CUSTOMER"
        ? "✅ Clienta registrada."
        : event.action === "CREATE_PRODUCT"
          ? "✅ Producto registrado."
          : "✅ Producto seleccionado.";
      await sendMessage(config, event.chatId, message + "\n\n" + telegramDraftText(draft), telegramDraftButtons(draft));
      return json({ ok: true, type: "DRAFT_UPDATED" });
    }
    if (response.status === 409 && result.code === "CAPTURE_DRAFT_PROCESSED") {
      await sendMessage(config, event.chatId, "ℹ️ Este borrador ya fue procesado; no se modificó el catálogo.");
      return json({ ok: true, type: "ALREADY_PROCESSED" });
    }
    if (response.status >= 500) throw new Error("No se pudo resolver la entidad Telegram");
    await sendMessage(config, event.chatId, "⚠️ " + (stringValue(result.error) || "No se pudo resolver la entidad."));
    return json({ ok: true, type: "USER_ERROR" });
  }
  const response = event.action === "CONFIRM"
    ? await (dependencies.confirmDraft ?? confirmCaptureDraft)(new Request("http://minierp.local/api/capture/drafts/" + event.draftId + "/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    }), user, event.draftId)
    : await (dependencies.rejectDraft ?? rejectCaptureDraft)(user, event.draftId);
  const result = await responseBody(response);

  if (response.ok) {
    const order = result.order as { orderNumber?: string } | undefined;
    const customer = result.customer as { name?: string } | undefined;
    const text = event.action === "CONFIRM"
      ? order?.orderNumber ? "✅ Pedido " + order.orderNumber + " creado."
        : customer?.name ? "✅ Cliente " + customer.name + " creado."
          : "✅ Borrador confirmado."
      : "🗑 Borrador descartado.";
    await sendMessage(config, event.chatId, text);
    return json({ ok: true, type: event.action === "CONFIRM" ? "CONFIRMED" : "REJECTED" });
  }

  if (response.status === 409 && result.code === "CAPTURE_DRAFT_PROCESSED") {
    await sendMessage(config, event.chatId, "ℹ️ Este borrador ya fue procesado; no se creó otro registro.");
    return json({ ok: true, type: "ALREADY_PROCESSED" });
  }
  if (response.status >= 500) throw new Error("No se pudo procesar la acción Telegram");
  await sendMessage(config, event.chatId, "⚠️ " + (stringValue(result.error) || "No se pudo procesar el borrador."));
  return json({ ok: true, type: "USER_ERROR" });
}

export async function handleTelegramWebhook(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  dependencies: TelegramWebhookDependencies = {}
) {
  if (request.method !== "POST") return errorResponse("Método no permitido.", 405);
  const config = readTelegramWebhookConfig(env);
  if (!telegramWebhookConfigReady(config)) return errorResponse("La integración directa de Telegram no está configurada.", 503);
  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!matchesTelegramWebhookSecret(providedSecret, config.webhookSecret)) return errorResponse("No autorizado.", 401);

  const update = await request.json().catch(() => null);
  const event = parseTelegramUpdate(update);
  if (!event) return errorResponse("Actualización de Telegram inválida.", 400);
  if (event.kind === "unsupported") return json({ ok: true, type: "IGNORED" });
  if (!isTelegramChatAllowed(event.chatId, config.allowedChatIds)) return errorResponse("Chat Telegram no autorizado.", 403);
  if (!isTelegramUserAllowed(event.userId, config.allowedUserIds)) return errorResponse("Usuario Telegram no autorizado.", 403);
  if (!allowChatRequest(event.chatId)) return errorResponse("Demasiados mensajes; intenta nuevamente en un minuto.", 429);

  try {
    const user = await (dependencies.resolveUser ?? configuredUser)(config);
    if (!user) return errorResponse("La cuenta de captura no está disponible.", 503);
    if (event.kind === "message") return await handleMessage(event, config, user, dependencies);
    try {
      await (dependencies.answerCallback ?? defaultAnswerCallback)(config, event.callbackId);
    } catch (error) {
      console.warn("telegram_callback_ack_failed", error instanceof Error ? error.message : "unknown");
    }
    return await handleCallback(event, config, user, dependencies);
  } catch (error) {
    console.error("telegram_webhook_failed", error instanceof Error ? error.message : "unknown");
    return errorResponse("No se pudo procesar la captura Telegram.", 502);
  }
}
