import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  isTelegramChatAllowed,
  parseTelegramAllowedChatIds,
  telegramDraftCanConfirm,
  telegramDraftText,
  telegramHelpText,
  telegramSourceMessageId,
  type TelegramCaptureButton,
  type TelegramDraftSummary
} from "../domain/telegram";
import { db } from "../db/client";
import { users } from "../db/schema";
import type { AuthUser } from "./auth";
import { confirmCaptureDraft, createCaptureDraft, rejectCaptureDraft } from "./capture";

export const telegramCapturePath = "/api/integrations/telegram/capture";

const telegramIdSchema = z.union([
  z.string().trim().min(1).max(200),
  z.number().int().nonnegative()
]).transform((value) => String(value));

const requestSchema = z.object({
  action: z.enum(["MESSAGE", "CONFIRM", "REJECT"]).default("MESSAGE"),
  chatId: telegramIdSchema,
  messageId: telegramIdSchema.optional(),
  text: z.string().trim().min(2).max(4000).optional(),
  draftId: z.string().uuid().optional(),
  callbackId: z.string().trim().max(200).optional()
});

type TelegramCaptureRequest = z.infer<typeof requestSchema>;
type JsonRecord = Record<string, unknown>;

export type TelegramCaptureConfig = {
  sharedSecret: string;
  businessId: string;
  userId: string;
  allowedChatIds: Set<string>;
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

export function readTelegramCaptureConfig(env: Record<string, string | undefined> = process.env): TelegramCaptureConfig {
  return {
    sharedSecret: env.TELEGRAM_CAPTURE_SHARED_SECRET?.trim() ?? "",
    businessId: env.TELEGRAM_CAPTURE_BUSINESS_ID?.trim() ?? "",
    userId: env.TELEGRAM_CAPTURE_USER_ID?.trim() ?? "",
    allowedChatIds: parseTelegramAllowedChatIds(env.TELEGRAM_CAPTURE_ALLOWED_CHAT_IDS)
  };
}

function isUuid(value: string) {
  return z.string().uuid().safeParse(value).success;
}

export function telegramCaptureConfigReady(config: TelegramCaptureConfig) {
  return config.sharedSecret.length >= 32
    && isUuid(config.businessId)
    && isUuid(config.userId)
    && config.allowedChatIds.size > 0;
}

export function matchesTelegramSharedSecret(provided: string, expected: string) {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function allowChatRequest(chatId: string) {
  const now = Date.now();
  const current = chatWindows.get(chatId);
  if (!current || current.resetAt <= now) {
    chatWindows.set(chatId, { count: 1, resetAt: now + CHAT_RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= CHAT_RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

async function configuredUser(config: TelegramCaptureConfig): Promise<AuthUser | null> {
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

function errorResponse(error: string, status: number) {
  return json({ ok: false, type: "ERROR", error }, status);
}

async function handleMessage(body: TelegramCaptureRequest, user: AuthUser) {
  if (!body.messageId || !body.text) return errorResponse("Faltan messageId y text para registrar el mensaje.", 400);
  const sourceMessageId = telegramSourceMessageId(body.chatId, body.messageId);
  const response = await createCaptureDraft(new Request("http://minierp.local/api/capture/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      channel: "TELEGRAM",
      conversationKey: body.chatId,
      sourceMessageId,
      rawText: body.text
    })
  }), user);
  const result = await responseBody(response);
  if (!response.ok) return errorResponse(stringValue(result.error) || "No se pudo crear el borrador.", response.status);
  const draft = result.draft as TelegramDraftSummary | undefined;
  if (!draft) return errorResponse("El servidor no devolvió un borrador válido.", 502);
  const buttons: TelegramCaptureButton[] = telegramDraftCanConfirm(draft)
    ? [
      { text: "✅ Confirmar", action: "CONFIRM", draftId: draft.id },
      { text: "🗑 Descartar", action: "REJECT", draftId: draft.id }
    ]
    : [];
  return json({
    ok: true,
    type: result.duplicate === true ? "DRAFT_ALREADY_EXISTS" : "DRAFT_CREATED",
    text: telegramDraftText(draft),
    draft,
    buttons
  }, response.status);
}

async function handleConfirm(body: TelegramCaptureRequest, user: AuthUser) {
  if (!body.draftId) return errorResponse("Falta draftId para confirmar.", 400);
  const response = await confirmCaptureDraft(new Request("http://minierp.local/api/capture/drafts/" + body.draftId + "/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  }), user, body.draftId);
  const result = await responseBody(response);
  if (response.ok) {
    const order = result.order as { orderNumber?: string } | undefined;
    const customer = result.customer as { name?: string } | undefined;
    const reference = order?.orderNumber ? "Pedido " + order.orderNumber + " creado." : customer?.name ? "Cliente " + customer.name + " creado." : "Borrador confirmado.";
    return json({ ok: true, type: "CONFIRMED", text: "✅ " + reference, ...result });
  }
  if (response.status === 409 && result.code === "CAPTURE_DRAFT_PROCESSED") {
    return json({ ok: true, type: "ALREADY_PROCESSED", text: "Este borrador ya fue procesado; no se creó otro registro." });
  }
  return errorResponse(stringValue(result.error) || "No se pudo confirmar el borrador.", response.status);
}

async function handleReject(body: TelegramCaptureRequest, user: AuthUser) {
  if (!body.draftId) return errorResponse("Falta draftId para descartar.", 400);
  const response = await rejectCaptureDraft(user, body.draftId);
  const result = await responseBody(response);
  if (response.ok) return json({ ok: true, type: "REJECTED", text: "🗑 Borrador descartado.", ...result });
  if (response.status === 409 && result.code === "CAPTURE_DRAFT_PROCESSED") {
    return json({ ok: true, type: "ALREADY_PROCESSED", text: "Este borrador ya fue procesado." });
  }
  return errorResponse(stringValue(result.error) || "No se pudo descartar el borrador.", response.status);
}

export async function handleTelegramCapture(request: Request) {
  const config = readTelegramCaptureConfig();
  if (!telegramCaptureConfigReady(config)) return errorResponse("La captura por Telegram no está configurada.", 503);
  const providedSecret = request.headers.get("x-telegram-capture-secret") ?? "";
  if (!matchesTelegramSharedSecret(providedSecret, config.sharedSecret)) return errorResponse("No autorizado.", 401);

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Solicitud Telegram inválida.", 400);
  const body = parsed.data;
  if (!isTelegramChatAllowed(body.chatId, config.allowedChatIds)) return errorResponse("Chat Telegram no autorizado.", 403);
  if (!allowChatRequest(body.chatId)) return errorResponse("Demasiados mensajes; intenta nuevamente en un minuto.", 429);

  try {
    const user = await configuredUser(config);
    if (!user) return errorResponse("La cuenta de captura no está disponible.", 503);
    if (body.action === "MESSAGE" && /^\/(start|help)\b/i.test(body.text ?? "")) {
      return json({ ok: true, type: "INFO", text: telegramHelpText() });
    }
    if (body.action === "MESSAGE") return handleMessage(body, user);
    if (body.action === "CONFIRM") return handleConfirm(body, user);
    return handleReject(body, user);
  } catch (error) {
    console.error("telegram_capture_failed", error instanceof Error ? error.message : "unknown");
    return errorResponse("No se pudo procesar la captura Telegram.", 500);
  }
}
