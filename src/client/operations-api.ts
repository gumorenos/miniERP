import { getToken } from "./api";

export type SizeConsumptionRow = { productId: string; size: string; fabricQtyMeters: number | null };
export type PurchaseRow = {
  id: string; purchaseDate: string; supplierName?: string | null; totalAmount: number; paymentMethod?: string | null; notes?: string | null;
  lines: Array<{ id: string; materialId: string; materialName: string; quantity: number | string; totalCost: number | string; unitCost: number | string }>;
};
export type ExpenseRow = { id: string; expenseDate: string; category: string; description: string; amount: number; paymentMethod?: string | null; orderId?: string | null; orderNumber?: string | null; notes?: string | null };
export type MoneySummary = { month: string; sales: number; collected: number; purchases: number; expenses: number; receivable: number; netCash: number };
export type AgendaData = {
  orders: Array<{ id: string; orderNumber: string; status: string; promisedDeliveryDate: string; customerName: string; phone?: string | null; agreedTotalPrice: number; balance: number }>;
  embroidery: Array<{ id: string; status: string; expectedReturnDate?: string | null; sentAt?: string | null; orderId: string; orderNumber: string; customerName: string; providerName: string; providerPhone?: string | null }>;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  const payload = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) throw new Error(payload.error ?? "Error de API");
  return payload as T;
}

export const operationsApi = {
  sizeConsumption: () => request<{ rows: SizeConsumptionRow[] }>("/api/workshop/size-consumption"),
  saveSizeConsumption: (productId: string, quantities: Record<string, number | null>) => request<{ rows: SizeConsumptionRow[] }>("/api/workshop/size-consumption", { method: "POST", body: JSON.stringify({ productId, quantities }) }),
  purchases: () => request<{ rows: PurchaseRow[] }>("/api/workshop/purchases"),
  createPurchase: (payload: Record<string, unknown>) => request<PurchaseRow>("/api/workshop/purchases", { method: "POST", body: JSON.stringify(payload) }),
  updatePurchase: (payload: Record<string, unknown>) => request<PurchaseRow>("/api/workshop/purchases", { method: "POST", body: JSON.stringify({ action: "update", ...payload }) }),
  archivePurchase: (id: string) => request<{ ok: true }>("/api/workshop/purchases", { method: "POST", body: JSON.stringify({ action: "archive", id }) }),
  expenses: () => request<{ rows: ExpenseRow[] }>("/api/workshop/expenses"),
  saveExpense: (payload: Record<string, unknown>) => request<ExpenseRow>("/api/workshop/expenses", { method: "POST", body: JSON.stringify(payload) }),
  archiveExpense: (id: string) => request<{ ok: true }>("/api/workshop/expenses", { method: "POST", body: JSON.stringify({ action: "archive", id }) }),
  money: (month?: string) => request<MoneySummary>(`/api/workshop/money${month ? `?month=${encodeURIComponent(month)}` : ""}`),
  agenda: () => request<AgendaData>("/api/workshop/agenda")
};
