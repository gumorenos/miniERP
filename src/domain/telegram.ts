import { captureIntentLabel, type CaptureIntent, type CapturePayload } from "./capture";
import { formatMoney } from "./money";

export type TelegramCaptureButton = {
  text: string;
  action: "CONFIRM" | "REJECT";
  draftId: string;
};

export type TelegramDraftSummary = {
  id: string;
  rawText: string;
  intent: CaptureIntent;
  status: string;
  payload: CapturePayload;
  missingFields: string[];
  ambiguousFields: string[];
  parserVersion: string;
};

function shorten(value: string, maxLength: number) {
  const clean = value.trim();
  return clean.length <= maxLength ? clean : clean.slice(0, maxLength - 1).trimEnd() + "…";
}

function money(value: number | undefined) {
  return value == null ? "no detectado" : formatMoney(value);
}

export function telegramSourceMessageId(chatId: string | number, messageId: string | number) {
  return String(chatId).trim() + ":" + String(messageId).trim();
}

export function parseTelegramAllowedChatIds(value: string | undefined) {
  return new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean));
}

export function isTelegramChatAllowed(chatId: string | number, allowedChatIds: Set<string>) {
  return allowedChatIds.has(String(chatId).trim());
}

export function telegramDraftCanConfirm(draft: TelegramDraftSummary) {
  if (draft.status !== "PENDING") return false;
  if (draft.intent === "NEW_CUSTOMER") return draft.missingFields.length === 0;
  if (draft.intent !== "NEW_ORDER") return false;
  return draft.missingFields.length === 0
    && !draft.ambiguousFields.includes("customer")
    && !draft.ambiguousFields.includes("product");
}

export function telegramDraftText(draft: TelegramDraftSummary) {
  const payload = draft.payload;
  const lines = [
    "🧾 Borrador de " + captureIntentLabel(draft.intent),
    "ID: " + draft.id,
    "",
    "Mensaje: " + shorten(draft.rawText, 900)
  ];

  if (draft.intent === "NEW_ORDER") {
    lines.push(
      "",
      "Cliente: " + (payload.customerName ?? "no resuelto"),
      "Producto: " + (payload.productName ?? "no resuelto"),
      "Talla: " + (payload.size ?? "no detectada"),
      "Color: " + (payload.color ?? "no detectado"),
      "Precio: " + money(payload.agreedTotalPrice),
      "Adelanto: " + money(payload.advanceAmount),
      "Entrega: " + (payload.promisedDeliveryDate ?? "no indicada")
    );
  } else if (draft.intent === "NEW_CUSTOMER") {
    lines.push("", "Nombre: " + (payload.name ?? "no detectado"), "Teléfono: " + (payload.phone ?? "no detectado"));
  } else if (payload.amount != null || payload.description) {
    lines.push("", "Descripción: " + (payload.description ?? "no indicada"), "Monto: " + money(payload.amount));
  }

  if (draft.missingFields.length) lines.push("", "Falta completar: " + draft.missingFields.join(", ") + ".");
  if (draft.ambiguousFields.length) lines.push("Revisar ambigüedad: " + draft.ambiguousFields.join(", ") + ".");

  if (telegramDraftCanConfirm(draft)) {
    lines.push("", "¿Confirmas que guarde estos datos?");
  } else if (draft.intent !== "NEW_ORDER" && draft.intent !== "NEW_CUSTOMER") {
    lines.push("", "Esta intención todavía queda como borrador; aún no se guarda en el negocio.");
  } else if (draft.missingFields.length) {
    lines.push("", "Envía otro mensaje con los datos faltantes. Este borrador seguirá pendiente.");
  }

  return shorten(lines.join("\n"), 3900);
}

export function telegramHelpText() {
  return [
    "Captura Samiiwara",
    "",
    "Envíame un pedido o un cliente escrito de forma natural.",
    "Primero te mostraré un borrador; solo se guarda cuando confirmes.",
    "",
    "También puedes usar los botones Confirmar y Descartar."
  ].join("\n");
}
