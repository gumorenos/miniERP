import { getToken, type Customer, type OrderDetail } from "./api";

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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: string }).error ?? "Error de API");
  return payload as T;
}

export type ArchiveEntityType = "CUSTOMER" | "PRODUCT" | "MATERIAL" | "ORDER" | "PAYMENT" | "PROVIDER" | "EMBROIDERY_JOB";

export const workshopApi = {
  updateCustomer: (payload: Record<string, unknown>) => request<Customer>("/api/customers", {
    method: "POST",
    body: JSON.stringify({ action: "update", ...payload })
  }),
  updateOrder: (payload: Record<string, unknown>) => request<{ ok: true; id: string }>("/api/orders", {
    method: "POST",
    body: JSON.stringify({ action: "update", ...payload })
  }),
  updatePayment: (orderId: string, payload: Record<string, unknown>) => request<Record<string, unknown>>(`/api/orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify({ action: "update", ...payload })
  }),
  account: () => request<{ id: string; name: string; email: string }>("/api/account"),
  updateAccount: (payload: { name: string; email: string; currentPassword?: string }) => request<{ id: string; name: string; email: string }>("/api/account", {
    method: "PATCH",
    body: JSON.stringify(payload)
  }),
  archive: (entityType: ArchiveEntityType, id: string) => request<{ ok: true; alreadyArchived?: boolean }>("/api/archive", {
    method: "POST",
    body: JSON.stringify({ entityType, id })
  }),
  archived: () => request<{ records: Array<{ entityType: ArchiveEntityType; id: string }> }>("/api/archive"),
  getOrder: (id: string) => request<OrderDetail>(`/api/orders/${id}`)
};
