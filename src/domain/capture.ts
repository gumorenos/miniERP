import { paymentMethods, sizes, type PaymentMethod, type Size } from "./types";

export const captureChannels = ["INTERNAL", "TELEGRAM", "WHATSAPP"] as const;
export type CaptureChannel = (typeof captureChannels)[number];

export const captureIntents = ["NEW_ORDER", "NEW_CUSTOMER", "NEW_PURCHASE", "NEW_EXPENSE", "STOCK_ADJUSTMENT", "UNKNOWN"] as const;
export type CaptureIntent = (typeof captureIntents)[number];

export type CaptureCatalog = {
  customers?: Array<{ id: string; name: string; phone?: string | null }>;
  products?: Array<{ id: string; name: string }>;
  materials?: Array<{ id: string; name: string }>;
};

export type CapturePayload = {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  productId?: string;
  productName?: string;
  materialId?: string;
  materialName?: string;
  name?: string;
  phone?: string;
  size?: Size;
  color?: string;
  quantity?: number;
  agreedTotalPrice?: number;
  advanceAmount?: number;
  advanceMethod?: PaymentMethod;
  promisedDeliveryDate?: string | null;
  description?: string;
  amount?: number;
  deliveryText?: string;
};

export type CaptureParseResult = {
  intent: CaptureIntent;
  parserVersion: "rules-v1";
  payload: CapturePayload;
  missingFields: string[];
  ambiguousFields: string[];
  confidence: "high" | "medium" | "low";
};

const colorNames = [
  ["negro", "Negro"], ["azul", "Azul"], ["rojo", "Rojo"], ["blanco", "Blanco"],
  ["morado", "Morado"], ["lila", "Lila"], ["fucsia", "Fucsia"],
  ["magenta", "Magenta"], ["rosado", "Rosado"], ["rosa", "Rosado"], ["naranja", "Naranja"],
  ["turquesa", "Turquesa"], ["verde", "Verde"], ["amarillo", "Amarillo"], ["beige", "Beige"],
  ["marron", "Marrón"], ["cafe", "Café"], ["plomo", "Plomo"], ["gris", "Gris"]
] as const;

const stopWords = /\s+(?:color|talla|talle|tamaño|por|dejo|dejó|adelanto|anticipo|abono|para|entrega|con|y\s+lo|$)/i;

function withoutAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeCaptureText(value: string) {
  return withoutAccents(value).toLocaleLowerCase("es-PE").replace(/\s+/g, " ").trim();
}

function cleanName(value: string) {
  return value.replace(/^[\s:,-]+|[\s:,-]+$/g, "").replace(/\s+/g, " ").trim();
}

function parseMoney(value: string) {
  const normalized = value.replace(/\s/g, "");
  const decimal = normalized.includes(",") && normalized.split(",")[1]?.length <= 2;
  const parsed = Number(decimal ? normalized.replace(".", "").replace(",", ".") : normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function findAmount(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.[1] ? parseMoney(match[1]) : undefined;
}

function findKnownMatch<T extends { id: string; name: string }>(text: string, candidates: T[] | undefined) {
  const normalizedText = normalizeCaptureText(text);
  const matches = (candidates ?? []).filter((candidate) => normalizedText.includes(normalizeCaptureText(candidate.name)));
  if (!matches.length) return { match: undefined, ambiguous: false };
  const longest = Math.max(...matches.map((candidate) => normalizeCaptureText(candidate.name).length));
  const top = matches.filter((candidate) => normalizeCaptureText(candidate.name).length === longest);
  return { match: top.length === 1 ? top[0] : undefined, ambiguous: top.length > 1 };
}

function extractCustomerName(text: string) {
  const explicit = text.match(/(?:cliente|clienta)\s*(?:es|se llama|:)?\s*([A-Za-zÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑ' -]{1,70})/i);
  if (explicit?.[1]) return cleanName(explicit[1].split(stopWords)[0]);
  const beforeVerb = text.match(/^(?:pedido\s+(?:para\s+)?)?(.+?)\s+(?:quiere|pide|encarga|necesita)\b/i);
  if (beforeVerb?.[1] && !/^yo|quiero$/i.test(cleanName(beforeVerb[1]))) return cleanName(beforeVerb[1].replace(/^para\s+/i, ""));
  return undefined;
}

function extractProductName(text: string) {
  const match = text.match(/(?:quiere|pide|encarga|necesita|quiero|comprar)\s+(?:un[ao]?|el|la)?\s*(.+)/i);
  if (!match?.[1]) return undefined;
  return cleanName(match[1].split(stopWords)[0]);
}

function findSize(text: string): Size | undefined {
  const match = normalizeCaptureText(text).match(/\b(?:talla|talle|tamano)\s*(?:es\s*)?(XXL|XL|S|M|L)\b/i);
  return match?.[1]?.toUpperCase() as Size | undefined;
}

function findColor(text: string) {
  const normalized = normalizeCaptureText(text);
  for (const [needle, label] of colorNames) {
    if (new RegExp("(?:color|en)\\s+" + needle + "\\b", "i").test(normalized) || new RegExp("\\b" + needle + "\\b", "i").test(normalized)) return label;
  }
  return undefined;
}

function findPaymentMethod(text: string): PaymentMethod | undefined {
  const normalized = normalizeCaptureText(text);
  if (/\byape\b/.test(normalized)) return "YAPE";
  if (/\bplin\b/.test(normalized)) return "PLIN";
  if (/efectivo|cash/.test(normalized)) return "CASH";
  if (/transferencia|banco/.test(normalized)) return "BANK_TRANSFER";
  return undefined;
}

function findPhone(text: string) {
  const match = text.match(/(?:\+?51\s*)?9\d(?:[\s-]?\d){7}/);
  return match?.[0]?.replace(/[\s-]/g, "") || undefined;
}

function dateForDay(day: number, now: Date) {
  const candidate = new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0, 0);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0)) candidate.setMonth(candidate.getMonth() + 1);
  return candidate.getFullYear() + "-" + String(candidate.getMonth() + 1).padStart(2, "0") + "-" + String(candidate.getDate()).padStart(2, "0");
}

function findDeliveryDate(text: string, now: Date) {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return { date: iso[1], deliveryText: iso[1], ambiguous: false };
  const slash = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}))?\b/);
  if (slash?.[1] && slash[2]) {
    const year = Number(slash[3] ?? now.getFullYear());
    const date = year + "-" + String(Number(slash[2])).padStart(2, "0") + "-" + String(Number(slash[1])).padStart(2, "0");
    return { date, deliveryText: slash[0], ambiguous: !slash[3] };
  }
  const day = text.match(/(?:para|entrega|entregar)\s+(?:el\s+)?(\d{1,2})\b/i);
  if (day?.[1]) return { date: dateForDay(Number(day[1]), now), deliveryText: day[0], ambiguous: true };
  return { date: undefined, deliveryText: undefined, ambiguous: false };
}

function classify(text: string): CaptureIntent {
  const normalized = normalizeCaptureText(text);
  if (/pedido|quiere|pide|encarga|talla|vestido|falda|casaca|prenda/.test(normalized)) return "NEW_ORDER";
  if (/nuevo cliente|crear cliente|cliente nuevo|guardar contacto/.test(normalized)) return "NEW_CUSTOMER";
  if (/compr[eé]|compra|tela|material|insumo/.test(normalized)) return "NEW_PURCHASE";
  if (/gasto|movilidad|taxi|delivery|pagu[eé]/.test(normalized)) return "NEW_EXPENSE";
  if (/ajuste|stock|inventario/.test(normalized)) return "STOCK_ADJUSTMENT";
  return "UNKNOWN";
}

function parseOrder(text: string, catalog: CaptureCatalog | undefined, now: Date): CaptureParseResult {
  const customerMatch = findKnownMatch(text, catalog?.customers);
  const productMatch = findKnownMatch(text, catalog?.products);
  const customerName = customerMatch.match?.name ?? extractCustomerName(text);
  const productName = productMatch.match?.name ?? extractProductName(text);
  const promised = findDeliveryDate(text, now);
  const advanceAmount = findAmount(text, /(?:dejo|dejó|adelanto|anticipo|abono|pago|pagó)\s*(?:de\s*)?(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)/i);
  const agreedTotalPrice = findAmount(text, /(?:precio|total|cuesta)\s*(?:de\s*)?(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)/i);
  const size = findSize(text);
  const color = findColor(text);
  const payload: CapturePayload = {
    customerId: customerMatch.match?.id,
    customerName,
    productId: productMatch.match?.id,
    productName,
    size,
    color,
    quantity: 1,
    agreedTotalPrice,
    advanceAmount: advanceAmount ?? 0,
    advanceMethod: findPaymentMethod(text) ?? (advanceAmount ? "YAPE" : undefined),
    promisedDeliveryDate: promised.date,
    deliveryText: promised.deliveryText
  };
  const missingFields = [
    !customerMatch.match ? "customer" : "",
    !productMatch.match ? "product" : "",
    !size ? "size" : "",
    !color ? "color" : ""
  ].filter(Boolean);
  const ambiguousFields = [
    customerMatch.ambiguous ? "customer" : "",
    productMatch.ambiguous ? "product" : "",
    promised.ambiguous ? "promisedDeliveryDate" : ""
  ].filter(Boolean);
  return {
    intent: "NEW_ORDER",
    parserVersion: "rules-v1",
    payload,
    missingFields,
    ambiguousFields,
    confidence: ambiguousFields.length ? "low" : missingFields.length ? "medium" : "high"
  };
}

export function parseCaptureMessage(text: string, catalog?: CaptureCatalog, now = new Date()): CaptureParseResult {
  const cleanText = text.trim();
  const intent = classify(cleanText);
  if (intent === "NEW_ORDER") return parseOrder(cleanText, catalog, now);

  if (intent === "NEW_CUSTOMER") {
    const explicit = cleanText.match(/(?:cliente|clienta)\s*(?:es|se llama|:)?\s*([A-Za-zÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑ' -]{1,70})/i);
    const phone = findPhone(cleanText);
    const name = explicit?.[1] ? cleanName(explicit[1].split(/\s+(?:9\d|tel[eé]fono|celular)/i)[0]) : undefined;
    return {
      intent,
      parserVersion: "rules-v1",
      payload: { name, phone },
      missingFields: name ? [] : ["name"],
      ambiguousFields: [],
      confidence: name ? "high" : "medium"
    };
  }

  const amount = findAmount(cleanText, /(?:s\/\.?|de|por|total|gasto|pago)\s*(\d+(?:[.,]\d{1,2})?)/i);
  const description = cleanText.replace(/^(?:nuevo\s+)?(?:gasto|compra|ajuste)\s*(?:de|:)?/i, "").trim() || undefined;
  return {
    intent,
    parserVersion: "rules-v1",
    payload: { amount, description },
    missingFields: intent === "UNKNOWN" ? ["intent"] : amount == null ? ["amount"] : [],
    ambiguousFields: [],
    confidence: intent === "UNKNOWN" ? "low" : amount == null ? "medium" : "high"
  };
}

export function captureIntentLabel(intent: CaptureIntent) {
  return {
    NEW_ORDER: "Nuevo pedido",
    NEW_CUSTOMER: "Nuevo cliente",
    NEW_PURCHASE: "Nueva compra",
    NEW_EXPENSE: "Nuevo gasto",
    STOCK_ADJUSTMENT: "Ajuste de stock",
    UNKNOWN: "No identificado"
  }[intent];
}

export function isCaptureChannel(value: string): value is CaptureChannel {
  return (captureChannels as readonly string[]).includes(value);
}

export function isCaptureSize(value: unknown): value is Size {
  return typeof value === "string" && (sizes as readonly string[]).includes(value);
}

export function isCapturePaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (paymentMethods as readonly string[]).includes(value);
}
