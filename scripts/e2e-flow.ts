const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const email = process.env.APP_USER_EMAIL ?? "admin@example.test";
const password = process.env.APP_USER_PASSWORD ?? "change-me-dev";

async function request<T>(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers }
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  await request("/api/health");
  const login = await request<{ token: string }>("/api/auth/login", undefined, { method: "POST", body: JSON.stringify({ email, password }) });
  const token = login.token;
  const boot = await request<any>("/api/bootstrap", token);
  const fabricBefore = boot.materials.find((item: any) => item.category === "FABRIC");
  const closureBefore = boot.materials.find((item: any) => item.category === "CLOSURE");
  const packagingBefore = boot.materials.find((item: any) => item.category === "PACKAGING");
  const product = boot.products[0];
  const provider = boot.providers[0];
  check(fabricBefore, "missing E2E fabric fixture; seed isolated QA fixtures before running this flow");
  check(closureBefore, "missing E2E closure fixture; seed isolated QA fixtures before running this flow");
  check(packagingBefore, "missing E2E packaging fixture; seed isolated QA fixtures before running this flow");
  check(product, "missing E2E product fixture; seed isolated QA fixtures before running this flow");
  check(provider, "missing E2E embroidery provider fixture; seed isolated QA fixtures before running this flow");

  const customer = await request<any>("/api/customers", token, { method: "POST", body: JSON.stringify({ name: `Cliente E2E ${Date.now()}` }) });
  const captureMessage = customer.name + " quiere " + product.name + " azul talla M, dejó 100 por Yape y lo quiere para el 8";
  const capture = await request<any>("/api/capture/drafts", token, {
    method: "POST",
    body: JSON.stringify({ channel: "INTERNAL", sourceMessageId: "e2e-capture-" + Date.now(), rawText: captureMessage })
  });
  check(capture.draft.intent === "NEW_ORDER", "capture did not identify a new order");
  check(capture.draft.payload.customerId === customer.id, "capture did not resolve the customer");
  check(capture.draft.payload.productId === product.id, "capture did not resolve the product");
  check(capture.draft.status === "PENDING", "capture draft was not left pending before confirmation");
  const captureDuplicate = await request<any>("/api/capture/drafts", token, {
    method: "POST",
    body: JSON.stringify({ channel: "INTERNAL", sourceMessageId: capture.draft.sourceMessageId, rawText: captureMessage })
  });
  check(captureDuplicate.duplicate === true && captureDuplicate.draft.id === capture.draft.id, "capture source id was not idempotent");
  const capturedOrder = await request<any>("/api/capture/drafts/" + capture.draft.id + "/confirm", token, {
    method: "POST",
    body: JSON.stringify({ payload: capture.draft.payload })
  });
  check(capturedOrder.draft.status === "CONFIRMED", "capture draft was not confirmed");
  check(capturedOrder.order?.status === "ORDER_RECEIVED", "capture did not create the order");
  check(capturedOrder.order?.payments?.length === 1 || capturedOrder.order?.financials?.totalPaid === 100, "capture did not preserve the advance");

  const purchaseMessage = `Compré 2 metros de ${fabricBefore.name} por 48`;
  const purchaseCapture = await request<any>("/api/capture/drafts", token, {
    method: "POST",
    body: JSON.stringify({ channel: "INTERNAL", sourceMessageId: "e2e-purchase-" + Date.now(), rawText: purchaseMessage })
  });
  check(purchaseCapture.draft.intent === "NEW_PURCHASE", "capture did not identify a new purchase");
  check(purchaseCapture.draft.missingFields.length === 0, "purchase capture left required fields missing");
  const capturedPurchase = await request<any>(`/api/capture/drafts/${purchaseCapture.draft.id}/confirm`, token, {
    method: "POST",
    body: JSON.stringify({ payload: purchaseCapture.draft.payload })
  });
  check(capturedPurchase.draft.status === "CONFIRMED" && capturedPurchase.confirmed?.entityType === "PURCHASE", "capture did not create the purchase");
  const afterCapturedPurchase = await request<any>("/api/bootstrap", token);
  const fabricAfterPurchase = afterCapturedPurchase.materials.find((item: any) => item.id === fabricBefore.id);
  check(fabricAfterPurchase.currentQuantity === fabricBefore.currentQuantity + 2, "captured purchase did not add stock");

  const expenseCapture = await request<any>("/api/capture/drafts", token, {
    method: "POST",
    body: JSON.stringify({ channel: "INTERNAL", sourceMessageId: "e2e-expense-" + Date.now(), rawText: "Gasto de 15 por movilidad pagado en Yape" })
  });
  check(expenseCapture.draft.intent === "NEW_EXPENSE" && expenseCapture.draft.missingFields.length === 0, "capture did not identify a complete expense");
  const capturedExpense = await request<any>(`/api/capture/drafts/${expenseCapture.draft.id}/confirm`, token, {
    method: "POST",
    body: JSON.stringify({ payload: expenseCapture.draft.payload })
  });
  check(capturedExpense.draft.status === "CONFIRMED" && capturedExpense.confirmed?.entityType === "EXPENSE", "capture did not create the expense");

  const adjustmentCapture = await request<any>("/api/capture/drafts", token, {
    method: "POST",
    body: JSON.stringify({ channel: "INTERNAL", sourceMessageId: "e2e-adjustment-" + Date.now(), rawText: `Ajuste de stock de ${fabricBefore.name} +1 metro por conteo` })
  });
  check(adjustmentCapture.draft.intent === "STOCK_ADJUSTMENT" && adjustmentCapture.draft.missingFields.length === 0, "capture did not identify a complete stock adjustment");
  const capturedAdjustment = await request<any>(`/api/capture/drafts/${adjustmentCapture.draft.id}/confirm`, token, {
    method: "POST",
    body: JSON.stringify({ payload: adjustmentCapture.draft.payload })
  });
  check(capturedAdjustment.draft.status === "CONFIRMED" && capturedAdjustment.confirmed?.entityType === "STOCK_MOVEMENT", "capture did not create the stock adjustment");
  const afterCapturedAdjustment = await request<any>("/api/bootstrap", token);
  check(afterCapturedAdjustment.materials.find((item: any) => item.id === fabricBefore.id).currentQuantity === fabricBefore.currentQuantity + 3, "captured stock adjustment did not update stock");

  const order = await request<any>("/api/orders", token, {
    method: "POST",
    body: JSON.stringify({ customerId: customer.id, productId: product.id, size: "S", color: "Negro", quantity: 1, agreedTotalPrice: 320, promisedDeliveryDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) })
  });
  check(order.status === "ORDER_RECEIVED", "order not created in initial status");
  check(Number(order.items[0]?.plannedFabricQty) === 1, "order did not snapshot planned fabric quantity");

  let detail = await request<any>(`/api/orders/${order.id}/payments`, token, { method: "POST", body: JSON.stringify({ amount: 100, method: "YAPE", notes: "Adelanto E2E" }) });
  check(detail.payments.length === 1 && detail.financials.balance === 220, "payment did not update balance from movement history");

  await request(`/api/orders/${order.id}/transition`, token, { method: "POST", body: JSON.stringify({ status: "READY_TO_CUT" }) });
  detail = await request<any>(`/api/orders/${order.id}/cut`, token, { method: "POST", body: JSON.stringify({}) });
  check(detail.status === "CUT", "cut transition failed");
  const afterFirstCut = await request<any>("/api/bootstrap", token);
  const fabricAfterFirstCut = afterFirstCut.materials.find((item: any) => item.id === fabricBefore.id);
  check(fabricAfterFirstCut.currentQuantity === fabricBefore.currentQuantity - 1, "cut did not discount exactly planned fabric");
  await request<any>(`/api/orders/${order.id}/cut`, token, { method: "POST", body: JSON.stringify({}) });
  const afterSecondCut = await request<any>("/api/bootstrap", token);
  check(afterSecondCut.materials.find((item: any) => item.id === fabricBefore.id).currentQuantity === fabricAfterFirstCut.currentQuantity, "second cut discounted stock again");

  detail = await request<any>(`/api/orders/${order.id}/send-embroidery`, token, { method: "POST", body: JSON.stringify({ providerId: provider.id, expectedReturnDate: "2026-01-01", estimatedCost: 80 }) });
  check(detail.status === "AT_EMBROIDERER", "embroidery send did not update order");
  const lateDashboard = await request<any>("/api/bootstrap", token);
  check(lateDashboard.dashboard.lateEmbroideryJobs.length > 0, "late embroidery was not derived");

  const job = detail.embroideryJobs[0];
  detail = await request<any>(`/api/embroidery-jobs/${job.id}/receive`, token, { method: "POST", body: JSON.stringify({ actualCost: 90 }) });
  check(detail.status === "EMBROIDERY_RECEIVED", "embroidery receive did not update order");

  await request(`/api/workshop/orders/${order.id}/assembly`, token, { method: "POST", body: "{}" });
  const afterAssembly = await request<any>("/api/bootstrap", token);
  const closureAfterAssembly = afterAssembly.materials.find((item: any) => item.id === closureBefore.id);
  check(closureAfterAssembly.currentQuantity === closureBefore.currentQuantity - 1, "assembly did not consume exactly one closure");
  await request(`/api/workshop/orders/${order.id}/assembly`, token, { method: "POST", body: "{}" });
  const afterSecondAssembly = await request<any>("/api/bootstrap", token);
  check(afterSecondAssembly.materials.find((item: any) => item.id === closureBefore.id).currentQuantity === closureAfterAssembly.currentQuantity, "second assembly consumed closure again");

  await request(`/api/workshop/orders/${order.id}/ready-delivery`, token, { method: "POST", body: "{}" });
  const afterReady = await request<any>("/api/bootstrap", token);
  const packagingAfterReady = afterReady.materials.find((item: any) => item.id === packagingBefore.id);
  check(packagingAfterReady.currentQuantity === packagingBefore.currentQuantity - 1, "ready for delivery did not consume exactly one package");
  await request(`/api/workshop/orders/${order.id}/ready-delivery`, token, { method: "POST", body: "{}" });
  const afterSecondReady = await request<any>("/api/bootstrap", token);
  check(afterSecondReady.materials.find((item: any) => item.id === packagingBefore.id).currentQuantity === packagingAfterReady.currentQuantity, "second ready action consumed packaging again");

  detail = await request<any>(`/api/orders/${order.id}/payments`, token, { method: "POST", body: JSON.stringify({ amount: 220, method: "CASH", notes: "Saldo E2E" }) });
  check(detail.payments.length === 2 && detail.financials.totalPaid === 320 && detail.financials.balance === 0, "balance payment overwrote or miscalculated payment history");
  await request(`/api/orders/${order.id}/transition`, token, { method: "POST", body: JSON.stringify({ status: "DELIVERED" }) });
  detail = await request<any>(`/api/orders/${order.id}/transition`, token, { method: "POST", body: JSON.stringify({ status: "CLOSED" }) });
  check(detail.status === "CLOSED", "order did not close");
  check(detail.financials.costForMargin > 0 && detail.financials.margin > 0, "cost/margin was not calculated");

  console.log(JSON.stringify({ ok: true, orderNumber: detail.orderNumber, margin: detail.financials.margin }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
