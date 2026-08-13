const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const email = process.env.APP_USER_EMAIL ?? "admin@example.test";
const password = process.env.APP_USER_PASSWORD ?? "change-me-dev";

async function request<T>(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  await request("/api/health");
  const login = await request<{ token: string }>("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  const token = login.token;
  const boot = await request<any>("/api/bootstrap", token);
  const materialBefore = boot.materials.find((item: any) => item.category === "FABRIC");
  const product = boot.products[0];
  const provider = boot.providers[0];
  check(materialBefore, "missing E2E fabric fixture; seed isolated QA fixtures before running this flow");
  check(product, "missing E2E product fixture; seed isolated QA fixtures before running this flow");
  check(provider, "missing E2E embroidery provider fixture; seed isolated QA fixtures before running this flow");

  const customer = await request<any>("/api/customers", token, {
    method: "POST",
    body: JSON.stringify({ name: `Cliente E2E ${Date.now()}` })
  });
  const order = await request<any>("/api/orders", token, {
    method: "POST",
    body: JSON.stringify({
      customerId: customer.id,
      productId: product.id,
      size: "S",
      color: "Negro",
      quantity: 1,
      agreedTotalPrice: 320,
      promisedDeliveryDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    })
  });
  check(order.status === "ORDER_RECEIVED", "order not created in initial status");

  let detail = await request<any>(`/api/orders/${order.id}/payments`, token, {
    method: "POST",
    body: JSON.stringify({ amount: 100, method: "YAPE", notes: "Adelanto E2E" })
  });
  check(detail.payments.length === 1 && detail.financials.balance === 220, "payment did not update balance from movement history");

  await request(`/api/orders/${order.id}/transition`, token, {
    method: "POST",
    body: JSON.stringify({ status: "READY_TO_CUT" })
  });
  detail = await request<any>(`/api/orders/${order.id}/cut`, token, { method: "POST", body: JSON.stringify({}) });
  check(detail.status === "CUT", "cut transition failed");
  const afterFirstCut = await request<any>("/api/bootstrap", token);
  const materialAfterFirstCut = afterFirstCut.materials.find((item: any) => item.id === materialBefore.id);
  check(materialAfterFirstCut.currentQuantity === materialBefore.currentQuantity - 1, "cut did not discount exactly one meter");

  await request<any>(`/api/orders/${order.id}/cut`, token, { method: "POST", body: JSON.stringify({}) });
  const afterSecondCut = await request<any>("/api/bootstrap", token);
  const materialAfterSecondCut = afterSecondCut.materials.find((item: any) => item.id === materialBefore.id);
  check(materialAfterSecondCut.currentQuantity === materialAfterFirstCut.currentQuantity, "second cut discounted stock again");

  detail = await request<any>(`/api/orders/${order.id}/send-embroidery`, token, {
    method: "POST",
    body: JSON.stringify({
      providerId: provider.id,
      expectedReturnDate: "2026-01-01",
      estimatedCost: 80
    })
  });
  check(detail.status === "AT_EMBROIDERER", "embroidery send did not update order");
  const lateDashboard = await request<any>("/api/bootstrap", token);
  check(lateDashboard.dashboard.lateEmbroideryJobs.length > 0, "late embroidery was not derived");

  const job = detail.embroideryJobs[0];
  detail = await request<any>(`/api/embroidery-jobs/${job.id}/receive`, token, {
    method: "POST",
    body: JSON.stringify({ actualCost: 90 })
  });
  check(detail.status === "EMBROIDERY_RECEIVED", "embroidery receive did not update order");
  await request(`/api/orders/${order.id}/transition`, token, {
    method: "POST",
    body: JSON.stringify({ status: "ASSEMBLY" })
  });
  await request(`/api/orders/${order.id}/transition`, token, {
    method: "POST",
    body: JSON.stringify({ status: "READY_FOR_DELIVERY" })
  });
  detail = await request<any>(`/api/orders/${order.id}/payments`, token, {
    method: "POST",
    body: JSON.stringify({ amount: 220, method: "CASH", notes: "Saldo E2E" })
  });
  check(detail.payments.length === 2 && detail.financials.totalPaid === 320 && detail.financials.balance === 0, "balance payment overwrote or miscalculated payment history");
  await request(`/api/orders/${order.id}/transition`, token, {
    method: "POST",
    body: JSON.stringify({ status: "DELIVERED" })
  });
  detail = await request<any>(`/api/orders/${order.id}/transition`, token, {
    method: "POST",
    body: JSON.stringify({ status: "CLOSED" })
  });
  check(detail.status === "CLOSED", "order did not close");
  check(detail.financials.costForMargin > 0 && detail.financials.margin > 0, "cost/margin was not calculated");

  console.log(JSON.stringify({ ok: true, orderNumber: detail.orderNumber, margin: detail.financials.margin }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
