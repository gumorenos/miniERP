import { describe, expect, it } from "vitest";
import { parseWhatsAppActionData, whatsappActionData, whatsappInteractiveMessage } from "./whatsapp";

const draftId = "33333333-3333-4333-8333-333333333333";

describe("WhatsApp interactive messages", () => {
  it("uses reply buttons for up to three actions", () => {
    const message = whatsappInteractiveMessage([
      { text: "✅ Confirmar", action: "CONFIRM", draftId },
      { text: "🗑 Descartar", action: "REJECT", draftId }
    ]);
    expect(message?.interactive.type).toBe("button");
    expect(message?.interactive.action.buttons).toHaveLength(2);
    expect(message?.interactive.action.buttons?.[0]?.reply.id).toBe(whatsappActionData("CONFIRM", draftId));
  });

  it("uses a list when entity resolution needs more than three actions", () => {
    const message = whatsappInteractiveMessage([
      { text: "✅ Crear clienta", action: "CREATE_CUSTOMER", draftId },
      { text: "Usar Vestido A", action: "SELECT_PRODUCT", draftId, optionIndex: 0 },
      { text: "Usar Vestido B", action: "SELECT_PRODUCT", draftId, optionIndex: 1 },
      { text: "➕ Crear producto", action: "CREATE_PRODUCT", draftId }
    ]);
    expect(message?.interactive.type).toBe("list");
    expect(message?.interactive.action.sections?.[0]?.rows).toHaveLength(4);
  });

  it("parses button and list reply identifiers using the capture contract", () => {
    expect(parseWhatsAppActionData(whatsappActionData("CREATE_PRODUCT", draftId) ?? "")).toEqual({ action: "CREATE_PRODUCT", draftId });
    expect(parseWhatsAppActionData("invalid")).toBeNull();
  });
});
