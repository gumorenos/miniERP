import { describe, expect, it } from "vitest";
import {
  isTelegramChatAllowed,
  parseTelegramAllowedChatIds,
  telegramDraftCanConfirm,
  telegramDraftButtons,
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

  it("asks for missing fields with user-friendly labels and examples", () => {
    const text = telegramDraftText({
      ...baseDraft,
      payload: { customerName: "María", color: "Azul" },
      missingFields: ["product", "size"],
      ambiguousFields: []
    });
    expect(text).toContain("Falta completar: producto o modelo, talla.");
    expect(text).toContain("1. ¿Qué producto o modelo es? Indica su nombre.");
    expect(text).toContain("2. ¿Qué talla necesita? Puede ser S, M, L, XL o XXL.");
    expect(text).not.toContain("¿Confirmas");
  });

  it("asks for an exact date when delivery date is ambiguous", () => {
    const text = telegramDraftText({
      ...baseDraft,
      ambiguousFields: ["promisedDeliveryDate"]
    });
    expect(text).toContain("fecha de entrega");
    expect(text).toContain("DD/MM/AAAA");
    expect(text).not.toContain("¿Confirmas");
  });

  it("offers entity-resolution buttons before confirmation", () => {
    const unresolved = {
      ...baseDraft,
      payload: {
        ...baseDraft.payload,
        customerName: "Ana",
        productName: "Vestido Margaritta",
        productCandidates: [{ id: "product-1", name: "Vestido Margarita" }]
      },
      missingFields: ["customer", "product"]
    };
    const buttons = telegramDraftButtons(unresolved);
    expect(buttons.map((button) => button.action)).toEqual(["CREATE_CUSTOMER", "SELECT_PRODUCT", "CREATE_PRODUCT"]);
    expect(buttons[1]?.optionIndex).toBe(0);
    expect(telegramDraftText(unresolved)).toContain("productos parecidos");
    expect(telegramDraftText(unresolved)).not.toContain("¿Confirmas");
    expect(telegramDraftButtons({ ...unresolved, ambiguousFields: ["product"] }).map((button) => button.action)).toEqual(["CREATE_CUSTOMER"]);
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
