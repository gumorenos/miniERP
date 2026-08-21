import { describe, expect, it } from "vitest";
import {
  handleTelegramWebhook,
  matchesTelegramWebhookSecret,
  parseTelegramCallbackData,
  parseTelegramUpdate,
  readTelegramWebhookConfig,
  telegramCallbackData,
  telegramInlineKeyboard,
  telegramWebhookConfigReady
} from "./telegram-webhook";

const env = {
  TELEGRAM_BOT_TOKEN: "1234567890:" + "a".repeat(32),
  TELEGRAM_WEBHOOK_SECRET: "s".repeat(32),
  TELEGRAM_BUSINESS_ID: "11111111-1111-4111-8111-111111111111",
  TELEGRAM_USER_ID: "22222222-2222-4222-8222-222222222222",
  TELEGRAM_ALLOWED_CHAT_IDS: "-100123,456",
  TELEGRAM_ALLOWED_USER_IDS: "9001"
};

const user = {
  id: env.TELEGRAM_USER_ID,
  businessId: env.TELEGRAM_BUSINESS_ID,
  email: "admin@example.test",
  name: "Admin"
};

const draft = {
  id: "33333333-3333-4333-8333-333333333333",
  rawText: "María quiere vestido Margarita azul talla M, precio 250.",
  intent: "NEW_ORDER" as const,
  status: "PENDING",
  payload: {
    customerName: "María",
    productName: "Margarita",
    size: "M" as const,
    color: "Azul",
    agreedTotalPrice: 250,
    advanceAmount: 0
  },
  missingFields: [],
  ambiguousFields: [],
  parserVersion: "rules-v1"
};

function webhookRequest(body: unknown, chatId = "-100123", secret = env.TELEGRAM_WEBHOOK_SECRET, userId = "9001") {
  const update = { ...(body as Record<string, unknown>) };
  if (update.message && typeof update.message === "object") {
    update.message = { ...(update.message as Record<string, unknown>), chat: { id: chatId }, from: { id: userId } };
  }
  if (update.callback_query && typeof update.callback_query === "object") {
    const callback = update.callback_query as Record<string, unknown>;
    const message = callback.message && typeof callback.message === "object" ? callback.message as Record<string, unknown> : {};
    update.callback_query = { ...callback, from: { id: userId }, message: { ...message, chat: { id: chatId } } };
  }
  return new Request("https://minierp.local/api/integrations/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret
    },
    body: JSON.stringify(update)
  });
}

describe("Telegram webhook parsing and configuration", () => {
  it("fails closed unless the bot, scope and secret are configured", () => {
    const config = readTelegramWebhookConfig(env);
    expect(telegramWebhookConfigReady(config)).toBe(true);
    expect(config.allowedChatIds.has("-100123")).toBe(true);
    expect(config.allowedUserIds.has("9001")).toBe(true);
    expect(telegramWebhookConfigReady(readTelegramWebhookConfig({ ...env, TELEGRAM_ALLOWED_CHAT_IDS: "" }))).toBe(false);
  });

  it("compares webhook secrets without accepting different lengths", () => {
    expect(matchesTelegramWebhookSecret(env.TELEGRAM_WEBHOOK_SECRET, env.TELEGRAM_WEBHOOK_SECRET)).toBe(true);
    expect(matchesTelegramWebhookSecret("s".repeat(31), env.TELEGRAM_WEBHOOK_SECRET)).toBe(false);
    expect(matchesTelegramWebhookSecret("x".repeat(32), env.TELEGRAM_WEBHOOK_SECRET)).toBe(false);
  });

  it("parses text updates and UUID-scoped callback data", () => {
    expect(parseTelegramUpdate({
      update_id: 1,
      message: { message_id: 7, from: { id: 9001 }, chat: { id: -100123 }, text: "hola" }
    })).toEqual({ kind: "message", chatId: "-100123", userId: "9001", messageId: "7", text: "hola" });
    expect(parseTelegramUpdate({
      update_id: 2,
      callback_query: {
        id: "callback-1",
        from: { id: 9001 },
        data: telegramCallbackData("CONFIRM", draft.id),
        message: { message_id: 8, chat: { id: -100123 } }
      }
    })).toEqual({ kind: "callback", chatId: "-100123", userId: "9001", callbackId: "callback-1", action: "CONFIRM", draftId: draft.id });
    expect(parseTelegramCallbackData("capture:confirm:not-a-uuid")).toBeNull();
  });

  it("maps capture actions to Telegram inline keyboard callbacks", () => {
    expect(telegramInlineKeyboard([
      { text: "✅ Confirmar", action: "CONFIRM", draftId: draft.id },
      { text: "🗑 Descartar", action: "REJECT", draftId: draft.id }
    ])).toEqual({ inline_keyboard: [[
      { text: "✅ Confirmar", callback_data: `capture:confirm:${draft.id}` },
      { text: "🗑 Descartar", callback_data: `capture:reject:${draft.id}` }
    ]] });
  });
});

describe("Telegram webhook flow", () => {
  it("creates an idempotent-shaped draft response and sends buttons", async () => {
    const sent: Array<{ chatId: string; text: string; buttons?: unknown[] }> = [];
    let received: unknown;
    const response = await handleTelegramWebhook(webhookRequest({
      update_id: 3,
      message: { message_id: 9, text: draft.rawText }
    }), env, {
      resolveUser: async () => user,
      createDraft: async (request) => {
        received = await request.json();
        return new Response(JSON.stringify({ duplicate: false, draft }), { status: 201 });
      },
      sendMessage: async (_config, chatId, text, buttons) => { sent.push({ chatId, text, buttons }); }
    });

    expect(response.status).toBe(200);
    expect(received).toEqual({ channel: "TELEGRAM", sourceMessageId: "-100123:9", rawText: draft.rawText });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.chatId).toBe("-100123");
    expect(sent[0]?.text).toContain("¿Confirmas");
    expect(sent[0]?.buttons).toHaveLength(2);
  });

  it("confirms a callback and acknowledges Telegram without exposing internals", async () => {
    const sent: string[] = [];
    const acknowledged: string[] = [];
    const response = await handleTelegramWebhook(webhookRequest({
      update_id: 4,
      callback_query: {
        id: "callback-2",
        data: `capture:confirm:${draft.id}`,
        message: { message_id: 10 }
      }
    }), env, {
      resolveUser: async () => user,
      confirmDraft: async () => new Response(JSON.stringify({ order: { orderNumber: "0007" } }), { status: 201 }),
      answerCallback: async (_config, callbackId) => { acknowledged.push(callbackId); },
      sendMessage: async (_config, _chatId, text) => { sent.push(text); }
    });

    expect(response.status).toBe(200);
    expect(acknowledged).toEqual(["callback-2"]);
    expect(sent).toEqual(["✅ Pedido 0007 creado."]);
  });

  it("rejects an invalid webhook secret before processing the update", async () => {
    const response = await handleTelegramWebhook(webhookRequest({ update_id: 5 }, "-100123", "x".repeat(32)), env, {
      resolveUser: async () => user
    });
    expect(response.status).toBe(401);
  });

  it("rejects a chat participant that is not in the Telegram user allowlist", async () => {
    const response = await handleTelegramWebhook(webhookRequest({ update_id: 6, message: { message_id: 11, text: "hola" } }, "-100123", env.TELEGRAM_WEBHOOK_SECRET, "9999"), env, {
      resolveUser: async () => user
    });
    expect(response.status).toBe(403);
  });
});
