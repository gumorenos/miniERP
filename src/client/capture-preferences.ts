const storageKey = "samiiwara.capture-preferences.v1";

export type CapturePreferences = {
  order?: {
    customerId?: string;
    productId?: string;
    size?: string;
    color?: string;
    advanceMethod?: string;
  };
  purchase?: {
    supplierId?: string;
    materialId?: string;
    paymentMethod?: string;
  };
  expense?: {
    category?: string;
    paymentMethod?: string;
    orderId?: string;
  };
  material?: {
    category?: string;
    unit?: string;
  };
};

function readPreferences(): CapturePreferences {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as CapturePreferences : {};
  } catch {
    return {};
  }
}

function writePreferences(next: CapturePreferences) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Storage can be unavailable in private browsing or embedded previews.
  }
}

function mergePreferences(section: keyof CapturePreferences, values: Record<string, string | undefined>) {
  const current = readPreferences();
  const existing = current[section];
  writePreferences({ ...current, [section]: { ...(existing && typeof existing === "object" ? existing : {}), ...values } });
}

export function getCapturePreferences() {
  return readPreferences();
}

export function rememberOrderPreferences(values: NonNullable<CapturePreferences["order"]>) {
  mergePreferences("order", values);
}

export function rememberPurchasePreferences(values: NonNullable<CapturePreferences["purchase"]>) {
  mergePreferences("purchase", values);
}

export function rememberExpensePreferences(values: NonNullable<CapturePreferences["expense"]>) {
  mergePreferences("expense", values);
}

export function rememberMaterialPreferences(values: NonNullable<CapturePreferences["material"]>) {
  mergePreferences("material", values);
}

export function preferredId<T extends { id: string }>(rows: T[], rememberedId?: string | null) {
  return rememberedId && rows.some((row) => row.id === rememberedId) ? rememberedId : rows[0]?.id ?? "";
}

