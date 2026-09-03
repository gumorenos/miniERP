import { captureFieldLabel, captureFollowUpPrompt, captureIntentLabel, type CaptureIntent, type CapturePayload } from "./capture";
import { formatMoney } from "./money";

export type TelegramCaptureButton = {
  text: string;
  action: TelegramCaptureAction;
  draftId: string;
  optionIndex?: number;
};

export type TelegramCaptureAction = "CONFIRM" | "REJECT" | "CREATE_CUSTOMER" | "CREATE_PRODUCT" | "SELECT_PRODUCT";

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

export function parseTelegramAllowedUserIds(value: string | undefined) {
  return parseTelegramAllowedChatIds(value);
}

export function isTelegramChatAllowed(chatId: string | number, allowedChatIds: Set<string>) {
  return allowedChatIds.has(String(chatId).trim());
}

export function isTelegramUserAllowed(userId: string | number, allowedUserIds: Set<string>) {
  return allowedUserIds.has(String(userId).trim());
}

export function telegramDraftCanConfirm(draft: TelegramDraftSummary) {
  if (draft.status !== "PENDING") return false;
  if (draft.intent === "NEW_CUSTOMER") return draft.missingFields.length === 0;
  if (["NEW_PURCHASE", "NEW_EXPENSE", "STOCK_ADJUSTMENT"].includes(draft.intent)) {
    return draft.missingFields.length === 0 && draft.ambiguousFields.length === 0;
  }
  if (draft.intent !== "NEW_ORDER") return false;
  return draft.missingFields.length === 0
    && draft.ambiguousFields.length === 0;
}

export function telegramDraftButtons(draft: TelegramDraftSummary): TelegramCaptureButton[] {
  if (draft.status !== "PENDING") return [];
  const buttons: TelegramCaptureButton[] = [];
  if (draft.intent === "NEW_ORDER") {
    if (!draft.payload.customerId && draft.payload.customerName && draft.missingFields.includes("customer") && !draft.ambiguousFields.includes("customer")) {
      buttons.push({ text: "✅ Crear clienta", action: "CREATE_CUSTOMER", draftId: draft.id });
    }
    if (!draft.payload.productId && draft.payload.productName && draft.missingFields.includes("product") && !draft.ambiguousFields.includes("product")) {
      const candidates = draft.payload.productCandidates ?? [];
      candidates.forEach((candidate, optionIndex) => {
        buttons.push({ text: "Usar " + shorten(candidate.name, 30), action: "SELECT_PRODUCT", draftId: draft.id, optionIndex });
      });
      buttons.push({
        text: candidates.length ? "➕ Crear nuevo" : "➕ Crear producto",
        action: "CREATE_PRODUCT",
        draftId: draft.id
      });
    }
  }
  if (telegramDraftCanConfirm(draft)) {
    buttons.push(
      { text: "✅ Confirmar", action: "CONFIRM", draftId: draft.id },
      { text: "🗑 Descartar", action: "REJECT", draftId: draft.id }
    );
  }
  return buttons;
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
    if (!payload.customerId && payload.customerName && draft.missingFields.includes("customer") && !draft.ambiguousFields.includes("customer")) {
      lines.push("", `⚠️ No encontré a la clienta «${shorten(payload.customerName, 80)}».`, "Si es nueva, pulsa «Crear clienta»." );
    }
    if (!payload.productId && payload.productName && draft.missingFields.includes("product") && !draft.ambiguousFields.includes("product")) {
      const candidates = payload.productCandidates ?? [];
      if (candidates.length) {
        lines.push("", `🔎 No encontré coincidencia exacta para «${shorten(payload.productName, 80)}».`, "Encontré productos parecidos; elige un botón o crea uno nuevo:");
      } else {
        lines.push("", `⚠️ No encontré el producto «${shorten(payload.productName, 80)}».`, "Si es nuevo, pulsa «Crear producto»." );
      }
    }
  } else if (draft.intent === "NEW_CUSTOMER") {
    lines.push("", "Nombre: " + (payload.name ?? "no detectado"), "Teléfono: " + (payload.phone ?? "no detectado"));
  } else if (draft.intent === "NEW_PURCHASE") {
    lines.push(
      "",
      "Material: " + (payload.materialName ?? "no resuelto"),
      "Cantidad: " + (payload.quantity ?? "no detectada"),
      "Costo total: " + money(payload.amount),
      ...(payload.unitCost != null ? ["Costo unitario: " + money(payload.unitCost)] : []),
      "Proveedor: " + (payload.supplierName ?? "sin proveedor"),
      "Método: " + (payload.paymentMethod ?? "no indicado")
    );
  } else if (draft.intent === "NEW_EXPENSE") {
    lines.push(
      "",
      "Descripción: " + (payload.description ?? "no indicada"),
      "Categoría: " + (payload.category ?? "OTHER"),
      "Monto: " + money(payload.amount),
      "Método: " + (payload.paymentMethod ?? "no indicado")
    );
  } else if (draft.intent === "STOCK_ADJUSTMENT") {
    lines.push(
      "",
      "Material: " + (payload.materialName ?? "no resuelto"),
      "Cantidad: " + (payload.quantity ?? "no detectada"),
      "Motivo: " + (payload.description ?? "no indicado")
    );
  } else if (payload.amount != null || payload.description) {
    lines.push("", "Descripción: " + (payload.description ?? "no indicada"), "Monto: " + money(payload.amount));
  }

  if (draft.missingFields.length) lines.push("", "Falta completar: " + draft.missingFields.map(captureFieldLabel).join(", ") + ".");
  if (draft.ambiguousFields.length) lines.push("Revisar: " + draft.ambiguousFields.map(captureFieldLabel).join(", ") + ".");

  if (telegramDraftCanConfirm(draft)) {
    lines.push("", "¿Confirmas que guarde estos datos?");
  } else if (draft.intent !== "NEW_ORDER" && draft.intent !== "NEW_CUSTOMER" && draft.missingFields.length === 0 && draft.ambiguousFields.length === 0) {
    lines.push("", "Esta intención todavía queda como borrador; aún no se guarda en el negocio.");
  } else if (draft.missingFields.length || draft.ambiguousFields.length) {
    const followUp = captureFollowUpPrompt(draft);
    if (followUp) lines.push("", followUp);
    lines.push("Este borrador seguirá pendiente hasta que los datos estén completos y confirmes.");
  }

  return shorten(lines.join("\n"), 3900);
}

export function telegramHelpText() {
  return [
    "Captura Samiiwara",
    "",
    "Envíame un pedido, compra, gasto o ajuste escrito de forma natural.",
    "Primero te mostraré un borrador; el pedido solo se guarda cuando confirmes.",
    "Las clientas y productos nuevos solo se crean cuando pulses su botón.",
    "",
    "También puedes usar los botones para elegir, crear, confirmar o descartar."
  ].join("\n");
}
