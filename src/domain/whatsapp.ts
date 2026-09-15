export function normalizeWhatsAppPhone(value: string, defaultCountryCode = "51") {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9) return `${defaultCountryCode}${digits}`;
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

export function whatsappUrl(phone: string, message: string) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function customerOrderMessage(input: { customerName: string; orderNumber: string; status: string; balance: number }) {
  const firstName = input.customerName.trim().split(/\s+/)[0] || input.customerName;
  const ready = ["READY_FOR_DELIVERY", "DELIVERED"].includes(input.status);
  const opening = ready
    ? `Hola ${firstName}, tu pedido ${input.orderNumber} de Samiiwara ya está listo para entregar.`
    : `Hola ${firstName}, te escribimos de Samiiwara sobre tu pedido ${input.orderNumber}.`;
  const balance = input.balance > 0 ? ` Tu saldo pendiente es S/ ${input.balance.toFixed(2)}.` : "";
  return `${opening}${balance}`;
}

export type WhatsAppCaptureButton = {
  text: string;
  action: "CONFIRM" | "REJECT" | "CREATE_CUSTOMER" | "CREATE_PRODUCT" | "SELECT_PRODUCT";
  draftId: string;
  optionIndex?: number;
};

function shorten(value: string, maxLength: number) {
  const clean = value.trim();
  return clean.length <= maxLength ? clean : clean.slice(0, maxLength - 1).trimEnd() + "…";
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function whatsappActionData(action: WhatsAppCaptureButton["action"], draftId: string, optionIndex?: number) {
  if (!validUuid(draftId)) return null;
  const code = { CONFIRM: "confirm", REJECT: "reject", CREATE_CUSTOMER: "cc", CREATE_PRODUCT: "cp", SELECT_PRODUCT: "ps" }[action];
  if (action === "SELECT_PRODUCT" && (optionIndex == null || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 9)) return null;
  const value = action === "SELECT_PRODUCT" ? `capture:${code}:${draftId}:${optionIndex}` : `capture:${code}:${draftId}`;
  return value.length <= 64 ? value : null;
}

export function parseWhatsAppActionData(value: string) {
  const parts = value.split(":");
  const code = parts[1]?.toLowerCase();
  const draftId = parts[2];
  if (parts[0] !== "capture" || !draftId || !validUuid(draftId)) return null;
  if (code === "ps") {
    const optionIndex = Number(parts[3]);
    if (parts.length !== 4 || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 9) return null;
    return { action: "SELECT_PRODUCT" as const, draftId, optionIndex };
  }
  if (parts.length !== 3) return null;
  const action = { confirm: "CONFIRM", reject: "REJECT", cc: "CREATE_CUSTOMER", cp: "CREATE_PRODUCT" }[code ?? ""] as WhatsAppCaptureButton["action"] | undefined;
  return action ? { action, draftId } : null;
}

export function whatsappInteractiveMessage(buttons: WhatsAppCaptureButton[]) {
  const entries = buttons.flatMap((button) => {
    const id = whatsappActionData(button.action, button.draftId, button.optionIndex);
    return id ? [{ id, text: shorten(button.text, 20) }] : [];
  });
  if (!entries.length) return undefined;

  if (entries.length <= 3) {
    return {
      type: "interactive" as const,
      interactive: {
        type: "button" as const,
        body: { text: "Selecciona una opción:" },
        action: {
          buttons: entries.map((entry) => ({ type: "reply" as const, reply: { id: entry.id, title: entry.text } }))
        }
      }
    };
  }

  return {
    type: "interactive" as const,
    interactive: {
      type: "list" as const,
      body: { text: "Selecciona una opción:" },
      action: {
        button: "Ver opciones",
        sections: [{ title: "Opciones", rows: entries.slice(0, 10).map((entry) => ({ id: entry.id, title: entry.text })) }]
      }
    }
  };
}
