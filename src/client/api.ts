export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  instagramHandle?: string | null;
  notes?: string | null;
};

export type Product = {
  id: string;
  name: string;
  type: string;
  baseSalePrice: string;
  defaultFabricQtyMeters?: string | null;
  defaultEmbroideryCost?: string | null;
  defaultOwnLaborCost?: string | null;
  active: boolean;
  sizePrices: Array<{ size: string; priceAdjustment: string; fixedPrice?: string | null }>;
};

export type Material = {
  id: string;
  name: string;
  category: string;
  unit: string;
  color?: string | null;
  minimumStock?: string | null;
  currentQuantity: number;
};

export type Provider = {
  id: string;
  name: string;
};

export type OrderSummary = {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  promisedDeliveryDate?: string | null;
  agreedTotalPrice: string;
};

export type OrderDetail = OrderSummary & {
  customer: Customer;
  items: Array<{ id: string; productId: string; size: string; color: string; quantity: number; plannedFabricQty?: string | null }>;
  payments: Array<{ id: string; amount: string; method: string; paidAt: string; notes?: string | null }>;
  embroideryJobs: Array<{ id: string; status: string; sentAt?: string | null; expectedReturnDate?: string | null; receivedAt?: string | null; estimatedCost?: string | null; actualCost?: string | null; overdueDays: number }>;
  history: Array<{ id: string; fromStatus?: string | null; toStatus: string; changedAt: string; note?: string | null }>;
  financials: {
    agreedTotalPrice: number;
    totalPaid: number;
    balance: number;
    estimatedCost: number;
    actualCost: number;
    costForMargin: number;
    margin: number;
  };
};

export type Bootstrap = {
  business: { id: string; name: string };
  demo: boolean;
  dashboard: {
    activeOrders: number;
    atEmbroidery: number;
    readyForDelivery: number;
    lateOrders: OrderSummary[];
    dueSoon: OrderSummary[];
    lateEmbroideryJobs: Array<{ id: string; expectedReturnDate: string; overdueDays: number }>;
    money: { sales: number; collected: number; receivable: number; margin: number };
  };
  customers: Customer[];
  products: Product[];
  materials: Material[];
  providers: Provider[];
  orders: OrderSummary[];
};

const tokenKey = "minierp.token";

export function getToken() {
  return localStorage.getItem(tokenKey);
}

export function setToken(token: string) {
  localStorage.setItem(tokenKey, token);
}

export function clearToken() {
  localStorage.removeItem(tokenKey);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error ?? "Error de API");
  }
  return response.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) => request<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST", body: JSON.stringify({}) }),
  bootstrap: () => request<Bootstrap>("/api/bootstrap"),
  createCustomer: (payload: Partial<Customer>) => request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(payload) }),
  createOrder: (payload: Record<string, unknown>) => request<OrderDetail>("/api/orders", { method: "POST", body: JSON.stringify(payload) }),
  getOrder: (id: string) => request<OrderDetail>(`/api/orders/${id}`),
  pay: (id: string, payload: Record<string, unknown>) => request<OrderDetail>(`/api/orders/${id}/payments`, { method: "POST", body: JSON.stringify(payload) }),
  transition: (id: string, status: string) => request<OrderDetail>(`/api/orders/${id}/transition`, { method: "POST", body: JSON.stringify({ status }) }),
  cut: (id: string) => request<OrderDetail>(`/api/orders/${id}/cut`, { method: "POST", body: JSON.stringify({}) }),
  sendEmbroidery: (id: string, payload: Record<string, unknown>) => request<OrderDetail>(`/api/orders/${id}/send-embroidery`, { method: "POST", body: JSON.stringify(payload) }),
  receiveEmbroidery: (id: string, jobId: string, actualCost: number) => request<OrderDetail>(`/api/embroidery-jobs/${jobId}/receive`, { method: "POST", body: JSON.stringify({ actualCost }) })
};
