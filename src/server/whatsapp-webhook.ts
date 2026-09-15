import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { parseWhatsAppActionData, whatsappInteractiveMessage, type WhatsAppCaptureButton } from "../domain/whatsapp";
import {
  isTelegramUserAllowed,
  telegramDraftButtons,
  telegramDraftText,
  telegramHelpText,
  telegramSourceMessageId,
  type TelegramDraftSummary
} from "../domain/telegram";
import { db } from "../db/client";
import { users } from "../db/schema";
import type { AuthUser } from "./auth";
import { confirmCaptureDraft, createCaptureDraft, rejectCaptureDraft, resolveCaptureDraftEntity, type CaptureDraftEntityAction } from "./capture";

export const whatsappWebhookPath = "/api/integrations/whatsapp/webhook";

const uuidSchema = z.string().uuid();

export type WhatsAppWebhookConfig = {
  accessToken: string;
  verifyToken: string;
  appSecret: string;
  phoneNumberId: string;
  apiVersion: string;
  businessId: string;
  userId: string;
  allowedPhoneNumbers: Set<string>;
};

type WhatsAppAction = "CONFIRM" | "REJECT" | "CREATE_CUSTOMER" | "CREATE_PRODUCT" | "SELECT_PRODUCT";

export type WhatsAppWebhookEvent =
  | { kind: "message"; from: string; messageId: string; text: string }
  | { kind: "action"; from: string; messageId: string; action: WhatsAppAction; draftId: string; optionIndex?: number }
  | { kind: "unsupported"; from?: string; messageId?: string };

type SendMessage = (config: WhatsAppWebhookConfig, to: string, text: string, buttons?: WhatsAppCaptureButton[]) => Promise<void>;

export type WhatsAppWebhookDependencies = {
  resolveUser?: (config: WhatsAppWebhookConfig) => Promise<AuthUser | null>;
  createDraft?: typeof createCaptureDraft;
  confirmDraft?: typeof confirmCaptureDraft;
  rejectDraft?: typeof rejectCaptureDraft;
  resolveDraftEntity?: typeof resolveCaptureDraftEntity;
  sendMessage?: SendMessage;
};

const phoneWindows = new Map<string, { count: number; resetAt: number }>();
const PHONE_RATE_LIMIT = 30;
const PHONE_RATE_WINDOW_MS = 60_000;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function errorResponse(error: string, status: number) {
  return json({ ok: false, type: "ERROR", error }, status);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isUuid(value: string) {
  return uuidSchema.safeParse(value).success;
}

export function normalizeWhatsAppPhoneNumber(value: string | number) {
  return String(value).replace(/\D/g, "");
}

export function parseWhatsAppAllowedPhoneNumbers(value: string | undefined) {
  return new Set((value ?? "").split(",").map((item) => normalizeWhatsAppPhoneNumber(item)).filter(Boolean));
}

export function readWhatsAppWebhookConfig(env: Record<string, string | undefined> = process.env): WhatsAppWebhookConfig {
  return {
    accessToken: env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "",
    verifyToken: env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "",
    appSecret: env.WHATSAPP_APP_SECRET?.trim() ?? "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "",
    apiVersion: env.WHATSAPP_API_VERSION?.trim() || "v23.0",
    businessId: env.WHATSAPP_BUSINESS_ID?.trim() ?? "",
    userId: env.WHATSAPP_USER_ID?.trim() ?? "",
    allowedPhoneNumbers: parseWhatsAppAllowedPhoneNumbers(env.WHATSAPP_ALLOWED_PHONE_NUMBERS)
  };
}

export function whatsappWebhookConfigReady(config: WhatsAppWebhookConfig) {
  return config.accessToken.length >= 20
    && config.verifyToken.length >= 16
    && config.appSecret.length >= 32
    && config.phoneNumberId.length >= 5
    && /^v\d+\.\d+$/.test(config.apiVersion)
    && isUuid(config.businessId)
    && isUuid(config.userId)
    && config.allowedPhoneNumbers.size > 0;
}

export function matchesWhatsAppSignature(rawBody: string, provided: string, appSecret: string) {
  if (!rawBody || !provided || !appSecret) return false;
  const prefix = "sha256=";
  if (!provided.startsWith(prefix)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const providedBuffer = Buffer.from(provided.slice(prefix.length), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export function matchesWhatsAppVerifyToken(provided: string, expected: string) {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function parseWhatsAppUpdate(value: unknown): WhatsAppWebhookEvent[] {
  const root = recordValue(value);
  if (root?.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return [];
  const events: WhatsAppWebhookEvent[] = [];

  for (const rawEntry of root.entry) {
    const entry = recordValue(rawEntry);
    if (!Array.isArray(entry?.changes)) continue;
    for (const rawChange of entry.changes) {
      const change = recordValue(rawChange);
      const changeValue = recordValue(change?.value);
      if (!Array.isArray(changeValue?.messages)) continue;
      for (const rawMessage of changeValue.messages) {
        const message = recordValue(rawMessage);
        const from = stringValue(message?.from);
        const messageId = stringValue(message?.id);
        if (!from || !messageId) {
          events.push({ kind: "unsupported", from: from || undefined, messageId: messageId || undefined });
          continue;
        }
        if (message?.type === "text") {
          const text = stringValue(recordValue(message.text)?.body).trim();
          events.push(text ? { kind: "message", from, messageId, text } : { kind: "unsupported", from, messageId });
          continue;
        }
        if (message?.type === "interactive") {
          const interactive = recordValue(message.interactive);
          const buttonReply = recordValue(interactive?.button_reply);
          const listReply = recordValue(interactive?.list_reply);
          const actionData = stringValue(buttonReply?.id || listReply?.id);
          const parsedAction = parseWhatsAppActionData(actionData);
          if (parsedAction) {
            events.push({ kind: "action", from, messageId, action: parsedAction.action, draftId: parsedAction.draftId, ...(parsedAction.optionIndex == null ? {} : { optionIndex: parsedAction.optionIndex }) });
          } else {
            events.push({ kind: "unsupported", from, messageId });
          }
          continue;
        }
        events.push({ kind: "unsupported", from, messageId });
      }
    }
  }
  return events;
}

function allowPhoneRequest(phone: string) {
  const now = Date.now();
  if (phoneWindows.size > 5_000) {
    for (const [key, value] of phoneWindows) if (value.resetAt <= now) phoneWindows.delete(key);
  }
  const current = phoneWindows.get(phone);
  if (!current || current.resetAt <= now) {
    phoneWindows.set(phone, { count: 1, resetAt: now + PHONE_RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= PHONE_RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

async function configuredUser(config: WhatsAppWebhookConfig): Promise<AuthUser | null> {
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

async function whatsappApiRequest(config: WhatsAppWebhookConfig, body: Record<string, unknown>) {
  const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body })
  });
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  if (!response.ok || payload?.error) throw new Error("WhatsApp API request failed");
}

const defaultSendMessage: SendMessage = async (config, to, text, buttons) => {
  await whatsappApiRequest(config, {
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text }
  });
  const interactive = whatsappInteractiveMessage(buttons ?? []);
  if (interactive) await whatsappApiRequest(config, { recipient_type: "individual", to, ...interactive });
};

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function draftFromResponse(result: Record<string, unknown>) {
  return result.draft as TelegramDraftSummary | undefined;
}

async function handleMessage(event: Extract<WhatsAppWebhookEvent, { kind: "message" }>, config: WhatsAppWebhookConfig, user: AuthUser, dependencies: WhatsAppWebhookDependencies) {
  const sendMessage = dependencies.sendMessage ?? defaultSendMessage;
  if (/^\/(?:start|help)\b/i.test(event.text)) {
    await sendMessage(config, event.from, telegramHelpText());
    return;
  }
  const response = await (dependencies.createDraft ?? createCaptureDraft)(new Request("http://minierp.local/api/capture/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      channel: "WHATSAPP",
      conversationKey: "whatsapp:" + normalizeWhatsAppPhoneNumber(event.from),
      sourceMessageId: telegramSourceMessageId("whatsapp", event.messageId),
      rawText: event.text
    })
  }), user);
  const result = await responseBody(response);
  if (!response.ok) {
    if (response.status >= 500) throw new Error("Could not create WhatsApp draft");
    await sendMessage(config, event.from, "⚠️ " + (stringValue(result.error) || "No se pudo crear el borrador."));
    return;
  }
  const draft = draftFromResponse(result);
  if (!draft) throw new Error("WhatsApp draft response was invalid");
  await sendMessage(config, event.from, telegramDraftText(draft), telegramDraftButtons(draft));
}

async function handleAction(event: Extract<WhatsAppWebhookEvent, { kind: "action" }>, config: WhatsAppWebhookConfig, user: AuthUser, dependencies: WhatsAppWebhookDependencies) {
  const sendMessage = dependencies.sendMessage ?? defaultSendMessage;
  if (event.action === "CREATE_CUSTOMER" || event.action === "CREATE_PRODUCT" || event.action === "SELECT_PRODUCT") {
    const entityAction: CaptureDraftEntityAction = event.action === "SELECT_PRODUCT"
      ? { type: "SELECT_PRODUCT", optionIndex: event.optionIndex ?? -1 }
      : { type: event.action };
    const response = await (dependencies.resolveDraftEntity ?? resolveCaptureDraftEntity)(user, event.draftId, entityAction);
    const result = await responseBody(response);
    if (response.ok) {
      const draft = draftFromResponse(result);
      if (!draft) throw new Error("WhatsApp draft response was invalid");
      const message = event.action === "CREATE_CUSTOMER" ? "✅ Clienta registrada."
        : event.action === "CREATE_PRODUCT" ? "✅ Producto registrado."
          : "✅ Producto seleccionado.";
      await sendMessage(config, event.from, message + "\n\n" + telegramDraftText(draft), telegramDraftButtons(draft));
      return;
    }
    if (response.status === 409 && result.code === "CAPTURE_DRAFT_PROCESSED") {
      await sendMessage(config, event.from, "ℹ️ Este borrador ya fue procesado; no se modificó el catálogo.");
      return;
    }
    if (response.status >= 500) throw new Error("Could not resolve WhatsApp draft entity");
    await sendMessage(config, event.from, "⚠️ " + (stringValue(result.error) || "No se pudo resolver la entidad."));
    return;
  }

  const response = event.action === "CONFIRM"
    ? await (dependencies.confirmDraft ?? confirmCaptureDraft)(new Request("http://minierp.local/api/capture/drafts/" + event.draftId + "/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }), user, event.draftId)
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
    await sendMessage(config, event.from, text);
    return;
  }
  if (response.status === 409 && result.code === "CAPTURE_DRAFT_PROCESSED") {
    await sendMessage(config, event.from, "ℹ️ Este borrador ya fue procesado; no se creó otro registro.");
    return;
  }
  if (response.status >= 500) throw new Error("Could not process WhatsApp draft action");
  await sendMessage(config, event.from, "⚠️ " + (stringValue(result.error) || "No se pudo procesar el borrador."));
}

export async function handleWhatsAppWebhook(request: Request, env: Record<string, string | undefined> = process.env, dependencies: WhatsAppWebhookDependencies = {}) {
  const config = readWhatsAppWebhookConfig(env);
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode") ?? "";
    const verifyToken = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && challenge && matchesWhatsAppVerifyToken(verifyToken, config.verifyToken)) return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
    return errorResponse("Verificación de WhatsApp inválida.", 403);
  }
  if (request.method !== "POST") return errorResponse("Método no permitido.", 405);
  if (!whatsappWebhookConfigReady(config)) return errorResponse("La integración de WhatsApp no está configurada.", 503);
  const rawBody = await request.text();
  if (!matchesWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256") ?? "", config.appSecret)) return errorResponse("No autorizado.", 401);

  let update: unknown;
  try {
    update = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse("Actualización de WhatsApp inválida.", 400);
  }
  const events = parseWhatsAppUpdate(update).filter((event) => event.kind !== "unsupported");
  const allowedEvents = events.filter((event) => isTelegramUserAllowed(event.from, config.allowedPhoneNumbers));
  if (!allowedEvents.length) return json({ ok: true, type: "IGNORED" });
  if (allowedEvents.some((event) => !allowPhoneRequest(event.from))) return errorResponse("Demasiados mensajes; intenta nuevamente en un minuto.", 429);

  try {
    const user = await (dependencies.resolveUser ?? configuredUser)(config);
    if (!user) return errorResponse("La cuenta de captura no está disponible.", 503);
    for (const event of allowedEvents) {
      if (event.kind === "message") await handleMessage(event, config, user, dependencies);
      else await handleAction(event, config, user, dependencies);
    }
    return json({ ok: true, type: "PROCESSED", count: allowedEvents.length });
  } catch (error) {
    console.error("whatsapp_webhook_failed", error instanceof Error ? error.message : "unknown");
    return errorResponse("No se pudo procesar la captura WhatsApp.", 502);
  }
}
