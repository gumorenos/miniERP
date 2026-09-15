import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  handleWhatsAppWebhook,
  matchesWhatsAppSignature,
  normalizeWhatsAppPhoneNumber,
  parseWhatsAppUpdate,
  readWhatsAppWebhookConfig,
  whatsappWebhookConfigReady
} from "./whatsapp-webhook";
import { whatsappActionData } from "../domain/whatsapp";

const env = {
  WHATSAPP_ACCESS_TOKEN: "a".repeat(40),
  WHATSAPP_VERIFY_TOKEN: "v".repeat(24),
  WHATSAPP_APP_SECRET: "s".repeat(40),
  WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
  WHATSAPP_API_VERSION: "v23.0",
  WHATSAPP_BUSINESS_ID: "11111111-1111-4111-8111-111111111111",
  WHATSAPP_USER_ID: "22222222-2222-4222-8222-222222222222",
  WHATSAPP_ALLOWED_PHONE_NUMBERS: "+51 999 888 777"
};

const user = {
  id: env.WHATSAPP_USER_ID,
  businessId: env.WHATSAPP_BUSINESS_ID,
  email: "admin@example.test",
  name: "Admin"
};

const draft = {
  id: "33333333-3333-4333-8333-333333333333",
  rawText: "Ana quiere vestido azul talla M",
  intent: "NEW_ORDER" as const,
  status: "PENDING",
  payload: { customerName: "Ana", productName: "Vestido", size: "M" as const, color: "Azul" },
  missingFields: ["customer", "product"],
  ambiguousFields: [],
  parserVersion: "rules-v1"
};

function signedBody(body: unknown) {
  const raw = JSON.stringify(body);
  return {
    raw,
    signature: "sha256=" + createHmac("sha256", env.WHATSAPP_APP_SECRET).update(raw).digest("hex")
  };
}

describe("WhatsApp webhook parsing and configuration", () => {
  it("accepts a complete configuration and normalizes phone numbers", () => {
    const config = readWhatsAppWebhookConfig(env);
    expect(whatsappWebhookConfigReady(config)).toBe(true);
    expect(config.allowedPhoneNumbers.has("51999888777")).toBe(true);
    expect(normalizeWhatsAppPhoneNumber("+51 (999) 888-777")).toBe("51999888777");
  });

  it("validates the signed raw body", () => {
    const { raw, signature } = signedBody({ object: "whatsapp_business_account" });
    expect(matchesWhatsAppSignature(raw, signature, env.WHATSAPP_APP_SECRET)).toBe(true);
    expect(matchesWhatsAppSignature(raw + " ", signature, env.WHATSAPP_APP_SECRET)).toBe(false);
  });

  it("parses text and interactive updates", () => {
    const events = parseWhatsAppUpdate({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { messages: [
        { from: "51999888777", id: "wamid-1", type: "text", text: { body: "Ana quiere vestido" } },
        { from: "51999888777", id: "wamid-2", type: "interactive", interactive: { button_reply: { id: whatsappActionData("CREATE_PRODUCT", draft.id) } } }
      ] } }] }]
    });
    expect(events[0]).toEqual({ kind: "message", from: "51999888777", messageId: "wamid-1", text: "Ana quiere vestido" });
    expect(events[1]).toEqual({ kind: "action", from: "51999888777", messageId: "wamid-2", action: "CREATE_PRODUCT", draftId: draft.id });
  });

  it("answers the provider verification challenge", async () => {
    const request = new Request("https://minierp.local" + "/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=" + env.WHATSAPP_VERIFY_TOKEN + "&hub.challenge=challenge-123");
    const response = await handleWhatsAppWebhook(request, env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("challenge-123");
  });
});

describe("WhatsApp webhook flow", () => {
  it("sends a draft with the same WhatsApp conversation key", async () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { messages: [{ from: "51999888777", id: "wamid-3", type: "text", text: { body: draft.rawText } }] } }] }]
    };
    const { raw, signature } = signedBody(body);
    let received: unknown;
    const sent: string[] = [];
    const response = await handleWhatsAppWebhook(new Request("https://minierp.local/api/integrations/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      body: raw
    }), env, {
      resolveUser: async () => user,
      createDraft: async (request) => {
        received = await request.json();
        return new Response(JSON.stringify({ duplicate: false, draft }), { status: 201 });
      },
      sendMessage: async (_config, _to, text) => { sent.push(text); }
    });
    expect(response.status).toBe(200);
    expect(received).toEqual({ channel: "WHATSAPP", conversationKey: "whatsapp:51999888777", sourceMessageId: "whatsapp:wamid-3", rawText: draft.rawText });
    expect(sent[0]).toContain("Borrador");
  });
});
