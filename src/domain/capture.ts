import { paymentMethods, sizes, type PaymentMethod, type Size } from "./types";

export const captureChannels = ["INTERNAL", "TELEGRAM", "WHATSAPP"] as const;
export type CaptureChannel = (typeof captureChannels)[number];

export const captureIntents = ["NEW_ORDER", "NEW_CUSTOMER", "NEW_PURCHASE", "NEW_EXPENSE", "STOCK_ADJUSTMENT", "UNKNOWN"] as const;
export type CaptureIntent = (typeof captureIntents)[number];

export type CaptureCatalog = {
  customers?: Array<{ id: string; name: string; phone?: string | null }>;
  products?: Array<{ id: string; name: string }>;
  materials?: Array<{ id: string; name: string }>;
  suppliers?: Array<{ id: string; name: string }>;
};

export type CaptureProductCandidate = {
  id: string;
  name: string;
};

export type CaptureConversationContext = {
  completionFields?: string[];
};

export type CapturePayload = {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  productId?: string;
  productName?: string;
  productCandidates?: CaptureProductCandidate[];
  customerResolution?: "PENDING_CREATE" | "RESOLVED";
  productResolution?: "PENDING_CREATE" | "RESOLVED";
  materialId?: string;
  materialName?: string;
  supplierId?: string;
  supplierName?: string;
  name?: string;
  phone?: string;
  size?: Size;
  color?: string;
  quantity?: number;
  unitCost?: number;
  agreedTotalPrice?: number;
  advanceAmount?: number;
  advanceMethod?: PaymentMethod;
  paymentMethod?: PaymentMethod;
  promisedDeliveryDate?: string | null;
  operationDate?: string | null;
  category?: string;
  orderId?: string | null;
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
const productAttributeStopWords = new RegExp(`\\s+(?:${colorNames.map(([needle]) => needle).join("|")})\\b`, "i");
const productContextStopWords = /\s+(?:talla|talle|tamaño|color|por|precio|total|cuesta|dejo|dejó|adelanto|anticipo|abono|para|entrega|con|y\s+lo)\b/i;

function withoutAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeCaptureText(value: string) {
  return withoutAccents(value).toLocaleLowerCase("es-PE").replace(/\s+/g, " ").trim();
}

function cleanName(value: string) {
  return value.replace(/^[\s:,-]+|[\s:,-]+$/g, "").replace(/\s+/g, " ").trim();
}

function cleanProductName(value: string) {
  return cleanName(value.split(productContextStopWords)[0].split(productAttributeStopWords)[0]);
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

function findQuantity(text: string, signed = false) {
  const sign = signed ? "[+-]?" : "";
  const unit = "(?:metros?|mts?\\.?|unidades?|uds?\\.?|rollos?|carretes?|kg|kilos?)";
  const withUnit = text.match(new RegExp("(" + sign + "\\d+(?:[.,]\\d{1,3})?)\\s*" + unit + "\\b", "i"));
  if (withUnit?.[1]) return parseMoney(withUnit[1]);
  const explicit = text.match(new RegExp("(?:cantidad|ajuste|stock|inventario)\\s*(?:de|del)?\\s*(" + sign + "\\d+(?:[.,]\\d{1,3})?)", "i"));
  return explicit?.[1] ? parseMoney(explicit[1]) : undefined;
}

function findUnitCost(text: string) {
  return findAmount(text, /(?:costo\s+unitario|precio\s+unitario)\s*(?:de|:)?\s*(?:s\/?\.?\s*)?(\d+(?:[.,]\d{1,2})?)/i);
}

function findOperationDate(text: string, now: Date) {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return iso[1];
  const slash = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}))?\b/);
  if (slash?.[1] && slash[2]) {
    const year = Number(slash[3] ?? now.getFullYear());
    return year + "-" + String(Number(slash[2])).padStart(2, "0") + "-" + String(Number(slash[1])).padStart(2, "0");
  }
  if (/\bhoy\b/i.test(text)) return now.toISOString().slice(0, 10);
  if (/\bayer\b/i.test(text)) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().slice(0, 10);
  }
  return undefined;
}

function extractMaterialName(text: string) {
  const match = text.match(/(?:comp(?:ra|ré)|adquir[ií]|material|insumo|ajuste(?:\s+de\s+stock)?|inventario|stock)\s*(?:de|del|:)?\s*(?:[+-]?\d+(?:[.,]\d+)?\s*(?:metros?|unidades?|uds?\.?|rollos?|carretes?|kg|kilos?)?\s*(?:de\s*)?)?([^,:]+?)(?=\s+(?:por|a|con|pag|para|porque|motivo|cantidad|costo)\b|\s*[:,-]?\s*[+-]?\d+(?:[.,]\d+)?\s*(?:metros?|unidades?|uds?\.?|rollos?|carretes?|kg|kilos?)?\b|$)/i);
  return match?.[1] ? cleanName(match[1]) : undefined;
}

function extractSupplierName(text: string) {
  const match = text.match(/\bproveedor(?:a)?\s+(?:es\s+|:)?([^,.;]+?)(?=\s*(?:[,.;]|\b(?:por|con|pag|para)\b|$))/i);
  return match?.[1] ? cleanName(match[1]) : undefined;
}

function expenseCategory(text: string) {
  const normalized = normalizeCaptureText(text);
  if (/bordado|bordador/.test(normalized)) return "EMBROIDERY";
  if (/movilidad|taxi|transporte|pasaje|delivery/.test(normalized)) return "TRANSPORT";
  if (/empaque|bolsa|caja/.test(normalized)) return "PACKAGING";
  if (/herramienta|máquina|maquina|reparación|reparacion/.test(normalized)) return "TOOLS";
  if (/servicio|internet|luz|agua|alquiler/.test(normalized)) return "SERVICES";
  if (/publicidad|marketing|anuncio/.test(normalized)) return "MARKETING";
  return "OTHER";
}

function operationDescription(text: string, intent: CaptureIntent) {
  const clean = text.replace(/^(?:nuevo\s+)?(?:gasto|compra|compré|compre|ajuste(?:\s+de\s+stock)?)\s*(?:de|:)?\s*/i, "").trim();
  if (intent === "NEW_EXPENSE") {
    if (/^(?:s\/?\.?\s*)?\d+(?:[.,]\d{1,2})?\s*(?:soles?|s\/?\.?)?$/i.test(clean)) return "";
    return cleanName(clean) || "Gasto registrado desde captura";
  }
  return cleanName(text);
}

function findKnownMatch<T extends { id: string; name: string }>(text: string, candidates: T[] | undefined) {
  const normalizedText = normalizeCaptureText(text);
  const matches = (candidates ?? []).filter((candidate) => {
    const normalizedName = normalizeCaptureText(candidate.name);
    return normalizedText.includes(normalizedName)
      || (normalizedText.length >= 3 && normalizedName.includes(normalizedText));
  });
  if (!matches.length) return { match: undefined, ambiguous: false };
  const longest = Math.max(...matches.map((candidate) => normalizeCaptureText(candidate.name).length));
  const top = matches.filter((candidate) => normalizeCaptureText(candidate.name).length === longest);
  return { match: top.length === 1 ? top[0] : undefined, ambiguous: top.length > 1 };
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) previous[rightIndex] = current[rightIndex] ?? 0;
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function productSimilarity(query: string, candidate: string) {
  const normalizedQuery = normalizeCaptureText(query);
  const normalizedCandidate = normalizeCaptureText(candidate);
  if (normalizedQuery.length < 3 || normalizedCandidate.length < 3) return 0;
  if (normalizedQuery === normalizedCandidate) return 1;
  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) return 0.95;

  const queryTokens = normalizedQuery.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  const candidateTokens = normalizedCandidate.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  if (!queryTokens.length || !candidateTokens.length) return 0;
  const tokenScores = queryTokens.map((queryToken) => Math.max(...candidateTokens.map((candidateToken) => {
    const distance = editDistance(queryToken, candidateToken);
    return 1 - distance / Math.max(queryToken.length, candidateToken.length);
  })));
  const tokenCoverage = tokenScores.filter((score) => score >= 0.72).length / queryTokens.length;
  const characterSimilarity = 1 - editDistance(normalizedQuery, normalizedCandidate) / Math.max(normalizedQuery.length, normalizedCandidate.length);
  return tokenCoverage * 0.65 + characterSimilarity * 0.35;
}

export function findSimilarProductCandidates(name: string | undefined, candidates: CaptureCatalog["products"] = []) {
  if (!name?.trim()) return [];
  return candidates
    .map((candidate) => ({ candidate, score: productSimilarity(name, candidate.name) }))
    .filter(({ score }) => score >= 0.58)
    .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name, "es"))
    .slice(0, 3)
    .map(({ candidate }) => ({ id: candidate.id, name: candidate.name }));
}

function extractCustomerName(text: string) {
  const explicit = text.match(/(?:cliente|clienta)\s*(?:es|se llama|:)?\s*([A-Za-zÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑ' -]{1,70})/i);
  if (explicit?.[1]) return cleanName(explicit[1].split(stopWords)[0].split(/\s+(?:producto|prenda|modelo)\b/i)[0]);
  const beforeVerb = text.match(/^(?:pedido\s+(?:para\s+)?)?(.+?)\s+(?:quiere|pide|encarga|necesita)\b/i);
  if (beforeVerb?.[1] && !/^yo|quiero$/i.test(cleanName(beforeVerb[1]))) return cleanName(beforeVerb[1].replace(/^para\s+/i, ""));
  return undefined;
}

function extractProductName(text: string) {
  const explicit = text.match(/(?:producto|prenda|modelo)\s*(?:es|:)?\s*([^,.;]+?)(?=\s+(?:talla|talle|tamaño|color|por|precio|total|cuesta|dejo|dejó|adelanto|anticipo|abono|para|entrega)\b|\s*[,.;]|$)/i);
  if (explicit?.[1]) return cleanProductName(explicit[1]);
  const match = text.match(/(?:quiere|pide|encarga|necesita|quiero|comprar)\s+(?:un[ao]?|el|la)?\s*(.+)/i);
  if (!match?.[1]) return undefined;
  return cleanProductName(match[1]);
}

function standaloneCustomerName(text: string) {
  const normalized = normalizeCaptureText(text);
  if (/^(?:s[ií]|no|ninguno|crear|nuevo|ok|vale)\b/i.test(text.trim())) return undefined;
  if (/^(?:producto|prenda|modelo|talla|talle|tamaño|color|precio|total)\b/i.test(text.trim())) return undefined;
  if (/^(?:xxl|xl|s|m|l|yape|plin|efectivo|cash|transferencia|banco)$/.test(normalized) || colorNames.some(([needle]) => needle === normalized)) return undefined;
  const phone = findPhone(text);
  const candidate = text.replace(phone ?? "", "").replace(/^(?:cliente|clienta)\s*(?:es|se llama|:)?\s*/i, "").trim();
  if (!candidate || /\d/.test(candidate)) return undefined;
  return cleanName(candidate);
}

function looksLikeProductText(text: string) {
  return /\b(?:producto|prenda|modelo|vestido|falda|casaca|polo|polera|camisa|blusa|chaqueta|pantal[oó]n|short)\b/i.test(text);
}

function standaloneProductName(text: string) {
  const normalized = normalizeCaptureText(text);
  if (/^(?:xxl|xl|s|m|l|yape|plin|efectivo|cash|transferencia|banco)$/.test(normalized) || colorNames.some(([needle]) => needle === normalized)) return undefined;
  const candidate = text
    .replace(/\b(?:talla|talle|tamaño)\s*(?:XXL|XL|S|M|L)\b.*$/i, "")
    .replace(/\b(?:color|por|precio|total|cuesta|dejo|dejó|adelanto|anticipo|abono|para|entrega)\b.*$/i, "")
    .replace(/^(?:producto|prenda|modelo)\s*(?:es|:)?\s*/i, "")
    .trim();
  if (!candidate || /^(?:s[ií]|no|ninguno|crear|nuevo|ok|vale)\b/i.test(candidate) || /^\d/.test(candidate)) return undefined;
  return cleanProductName(candidate);
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
  if (/ajuste|stock|inventario/.test(normalized)) return "STOCK_ADJUSTMENT";
  if (/gasto|movilidad|taxi|delivery/.test(normalized)) return "NEW_EXPENSE";
  if (/compr[eé]|compra|tela|material|insumo/.test(normalized)) return "NEW_PURCHASE";
  if (/pagu[eé]/.test(normalized)) return "NEW_EXPENSE";
  return "UNKNOWN";
}

function parseOrder(text: string, catalog: CaptureCatalog | undefined, now: Date, context?: CaptureConversationContext): CaptureParseResult {
  const extractedCustomerName = extractCustomerName(text)
    ?? (context?.completionFields?.includes("customer") ? standaloneCustomerName(text) : undefined);
  const extractedProductName = extractProductName(text)
    ?? (context?.completionFields?.includes("product")
      && (!context.completionFields.includes("customer") || looksLikeProductText(text))
      ? standaloneProductName(text)
      : undefined);
  const wholeCustomerMatch = findKnownMatch(text, catalog?.customers);
  const customerMatch = wholeCustomerMatch.match || wholeCustomerMatch.ambiguous
    ? wholeCustomerMatch
    : findKnownMatch(extractedCustomerName ?? "", catalog?.customers);
  const wholeProductMatch = findKnownMatch(text, catalog?.products);
  const productMatch = wholeProductMatch.match || wholeProductMatch.ambiguous
    ? wholeProductMatch
    : findKnownMatch(extractedProductName ?? "", catalog?.products);
  const customerName = customerMatch.match?.name ?? extractedCustomerName;
  const productName = productMatch.match?.name ?? extractedProductName;
  const promised = findDeliveryDate(text, now);
  const advanceAmount = findAmount(text, /(?:dejo|dejó|adelanto|anticipo|abono|pago|pagó)\s*(?:de\s*)?(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)/i);
  const agreedTotalPrice = findAmount(text, /(?:precio|total|cuesta)\s*(?:de\s*)?(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)/i)
    ?? (context?.completionFields?.includes("productPrice")
      ? findAmount(text, /(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:soles?|s\/\.?|$)/i)
      : undefined);
  const size = findSize(text);
  const color = findColor(text);
  const productCandidates = !productMatch.match && !productMatch.ambiguous
    ? findSimilarProductCandidates(productName, catalog?.products)
    : [];
  const payload: CapturePayload = {
    customerId: customerMatch.match?.id,
    customerName,
    customerPhone: findPhone(text),
    productId: productMatch.match?.id,
    productName,
    ...(productCandidates.length ? { productCandidates } : {}),
    ...(!customerMatch.match && !customerMatch.ambiguous && customerName ? { customerResolution: "PENDING_CREATE" as const } : {}),
    ...(!productMatch.match && !productMatch.ambiguous && productName && !productCandidates.length ? { productResolution: "PENDING_CREATE" as const } : {}),
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
    !productMatch.match && !productMatch.ambiguous && !productCandidates.length && agreedTotalPrice == null ? "productPrice" : "",
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

function parseOperational(text: string, intent: CaptureIntent, catalog: CaptureCatalog | undefined, now: Date): CaptureParseResult {
  const materialMatch = findKnownMatch(text, catalog?.materials);
  const supplierMatch = findKnownMatch(text, catalog?.suppliers);
  const materialName = materialMatch.match?.name ?? extractMaterialName(text);
  const supplierName = supplierMatch.match?.name ?? extractSupplierName(text);
  const operationDate = findOperationDate(text, now);
  const paymentMethod = findPaymentMethod(text);
  const description = operationDescription(text, intent);

  if (intent === "NEW_PURCHASE") {
    const quantity = findQuantity(text);
    const unitCost = findUnitCost(text);
    const detectedAmount = findAmount(text, /(?:total|costo|por|pagu[eé]|pagado)\s*(?:de\s*)?(?:s\/?\.?\s*)?(\d+(?:[.,]\d{1,2})?)/i);
    const amount = detectedAmount ?? (quantity != null && unitCost != null ? quantity * unitCost : undefined);
    const payload: CapturePayload = {
      materialId: materialMatch.match?.id,
      materialName,
      supplierId: supplierMatch.match?.id,
      supplierName,
      quantity,
      amount,
      unitCost,
      paymentMethod,
      operationDate: operationDate ?? null,
      description
    };
    return {
      intent,
      parserVersion: "rules-v1",
      payload,
      missingFields: [!materialMatch.match ? "material" : "", quantity == null ? "quantity" : "", amount == null ? "amount" : ""].filter(Boolean),
      ambiguousFields: [materialMatch.ambiguous ? "material" : "", supplierMatch.ambiguous ? "supplier" : ""].filter(Boolean),
      confidence: materialMatch.ambiguous ? "low" : (!materialMatch.match || quantity == null || amount == null) ? "medium" : "high"
    };
  }

  if (intent === "STOCK_ADJUSTMENT") {
    let quantity = findQuantity(text, true);
    if (quantity != null && /\b(?:merma|p[eé]rdida|salida|consumo|retirar|retir[oó])\b/i.test(text) && quantity > 0) quantity = -quantity;
    const payload: CapturePayload = {
      materialId: materialMatch.match?.id,
      materialName,
      quantity,
      unitCost: findUnitCost(text),
      operationDate: operationDate ?? null,
      description
    };
    return {
      intent,
      parserVersion: "rules-v1",
      payload,
      missingFields: [!materialMatch.match ? "material" : "", quantity == null ? "quantity" : "", description.length < 2 ? "description" : ""].filter(Boolean),
      ambiguousFields: materialMatch.ambiguous ? ["material"] : [],
      confidence: materialMatch.ambiguous ? "low" : (!materialMatch.match || quantity == null) ? "medium" : "high"
    };
  }

  const amount = findAmount(text, /(?:s\/?\.?|de|por|total|gasto|pago|pagu[eé])\s*(\d+(?:[.,]\d{1,2})?)/i)
    ?? findAmount(text, /(?:^|\s)(?:s\/?\.?\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*(?:soles?|s\/?\.?))?\s*$/i);
  const payload: CapturePayload = {
    amount,
    description,
    category: expenseCategory(text),
    paymentMethod,
    operationDate: operationDate ?? null
  };
  return {
    intent,
    parserVersion: "rules-v1",
    payload,
    missingFields: [amount == null ? "amount" : "", description.length < 2 ? "description" : ""].filter(Boolean),
    ambiguousFields: [],
    confidence: amount == null ? "medium" : "high"
  };
}

export function parseCaptureMessage(text: string, catalog?: CaptureCatalog, now = new Date(), forcedIntent?: CaptureIntent, context?: CaptureConversationContext): CaptureParseResult {
  const cleanText = text.trim();
  const intent = forcedIntent ?? classify(cleanText);
  if (intent === "NEW_ORDER") return parseOrder(cleanText, catalog, now, context);

  if (intent === "NEW_CUSTOMER") {
    const explicit = cleanText.match(/(?:cliente|clienta)\s*(?:es|se llama|:)?\s*([A-Za-zÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑ' -]{1,70})/i);
    const phone = findPhone(cleanText);
    const name = explicit?.[1]
      ? cleanName(explicit[1].split(/\s+(?:9\d|tel[eé]fono|celular)/i)[0])
      : forcedIntent === "NEW_CUSTOMER" && !/\d/.test(cleanText) ? cleanName(cleanText) : undefined;
    return {
      intent,
      parserVersion: "rules-v1",
      payload: { name, phone },
      missingFields: name ? [] : ["name"],
      ambiguousFields: [],
      confidence: name ? "high" : "medium"
    };
  }

  if (["NEW_PURCHASE", "NEW_EXPENSE", "STOCK_ADJUSTMENT"].includes(intent)) {
    return parseOperational(cleanText, intent, catalog, now);
  }
  return {
    intent,
    parserVersion: "rules-v1",
    payload: {},
    missingFields: ["intent"],
    ambiguousFields: [],
    confidence: "low"
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

const captureFieldLabels: Record<string, string> = {
  intent: "tipo de registro",
  customer: "clienta",
  product: "producto o modelo",
  productPrice: "precio del producto",
  size: "talla",
  color: "color",
  promisedDeliveryDate: "fecha de entrega",
  name: "nombre",
  phone: "teléfono",
  material: "material",
  quantity: "cantidad",
  amount: "monto total",
  description: "descripción",
  supplier: "proveedor",
  paymentMethod: "método de pago"
};

export function captureFieldLabel(field: string) {
  return captureFieldLabels[field] ?? field;
}

function captureFieldQuestion(intent: CaptureIntent, field: string, ambiguous: boolean) {
  if (ambiguous && field === "customer") return "¿Cuál de las clientas es? Escribe su nombre completo.";
  if (ambiguous && field === "product") return "¿Cuál de los productos o modelos es? Escribe el nombre exacto.";
  if (ambiguous && field === "material") return "¿Cuál de los materiales es? Escribe el nombre exacto.";
  if (ambiguous && field === "supplier") return "¿Cuál de los proveedores es? Escribe el nombre exacto.";
  if (ambiguous && field === "promisedDeliveryDate") return "¿Qué fecha exacta de entrega confirmamos? Escríbela como DD/MM/AAAA.";

  if (field === "customer") return "¿Para quién es el pedido? Indica el nombre de la clienta.";
  if (field === "product") return "¿Qué producto o modelo es? Indica su nombre.";
  if (field === "productPrice") return "¿Cuál es el precio base del producto nuevo? Indica un monto mayor a cero.";
  if (field === "size") return "¿Qué talla necesita? Puede ser S, M, L, XL o XXL.";
  if (field === "color") return "¿Qué color llevará?";
  if (field === "promisedDeliveryDate") return "¿Para qué fecha se necesita? Escríbela como DD/MM/AAAA.";
  if (field === "name") return "¿Cuál es el nombre de la nueva clienta?";
  if (field === "phone") return "¿Cuál es su teléfono?";
  if (field === "material") return intent === "STOCK_ADJUSTMENT"
    ? "¿Qué material deseas ajustar? Indica el nombre exacto."
    : "¿Qué material compraste? Indica el nombre exacto.";
  if (field === "quantity") return intent === "STOCK_ADJUSTMENT"
    ? "¿Qué cantidad deseas ajustar? Usa un número positivo para ingreso o negativo para salida."
    : "¿Qué cantidad compraste? Indica también la unidad si aplica, por ejemplo: 5 metros.";
  if (field === "amount") return "¿Cuál fue el monto total?";
  if (field === "description") return intent === "STOCK_ADJUSTMENT"
    ? "¿Cuál es el motivo del ajuste?"
    : "¿Qué descripción breve le ponemos?";
  return "¿Puedes indicar el " + captureFieldLabel(field) + "?";
}

export function captureFollowUpPrompt(input: Pick<CaptureParseResult, "intent" | "missingFields" | "ambiguousFields">) {
  const fields = [...input.missingFields, ...input.ambiguousFields.filter((field) => !input.missingFields.includes(field))];
  if (!fields.length) return null;
  const questions = fields.slice(0, 3).map((field) => captureFieldQuestion(input.intent, field, input.ambiguousFields.includes(field)));
  const remaining = fields.length - questions.length;
  return [
    "Para completar este borrador, respóndeme en un solo mensaje:",
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    ...(remaining > 0 ? [`También falta indicar: ${fields.slice(3).map(captureFieldLabel).join(", ")}.`] : [])
  ].join("\n");
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
