import { describe, expect, it } from "vitest";
import {
  isTelegramChatAllowed,
  parseTelegramAllowedChatIds,
  telegramDraftCanConfirm,
  telegramDraftText,
  telegramSourceMessageId
} from "./telegram";

const baseDraft = {
  id: "draft-1",
  rawText: "María quiere vestido Margarita azul talla M, dejó 100 por Yape.",
  intent: "NEW_ORDER" as const,
  status: "PENDING",
  payload: {
    customerName: "María",
    productName: "Vestido Margarita",
    size: "M" as const,
    color: "Azul",
    agreedTotalPrice: 320,
    advanceAmount: 100,
    advanceMethod: "YAPE" as const
  },
  missingFields: [],
  ambiguousFields: [],
  parserVersion: "rules-v1"
};

describe("Telegram capture helpers", () => {
  it("creates a stable source id for idempotent inbound messages", () => {
    expect(telegramSourceMessageId(-100123, 44)).toBe("-100123:44");
  });

  it("allows only explicitly configured chats", () => {
    const allowed = parseTelegramAllowedChatIds(" 123 , -100456,123 ");
    expect(isTelegramChatAllowed("-100456", allowed)).toBe(true);
    expect(isTelegramChatAllowed("999", allowed)).toBe(false);
  });

  it("offers confirmation only for complete supported drafts", () => {
    expect(telegramDraftCanConfirm(baseDraft)).toBe(true);
    expect(telegramDraftCanConfirm({ ...baseDraft, missingFields: ["color"] })).toBe(false);
    expect(telegramDraftCanConfirm({ ...baseDraft, ambiguousFields: ["product"] })).toBe(false);
  });

  it("renders a reviewable Spanish summary without silently confirming", () => {
    const text = telegramDraftText(baseDraft);
    expect(text).toContain("Vestido Margarita");
    expect(text).toContain("Adelanto: S/ 100.00");
    expect(text).toContain("¿Confirmas que guarde estos datos?");
  });

  it("offers confirmation for complete operational drafts", () => {
    const purchase = {
      ...baseDraft,
      intent: "NEW_PURCHASE" as const,
      rawText: "Compré tela azul",
      payload: { materialName: "Tela azul", quantity: 5, amount: 120, paymentMethod: "YAPE" as const },
      missingFields: [],
      ambiguousFields: []
    };
    expect(telegramDraftCanConfirm(purchase)).toBe(true);
    expect(telegramDraftCanConfirm({ ...purchase, ambiguousFields: ["material"] })).toBe(false);
    expect(telegramDraftText(purchase)).toContain("Costo total: S/ 120.00");
  });
});
