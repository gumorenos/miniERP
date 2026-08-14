import type { AuthUser } from "./auth";
import { workshopAgenda } from "./workshop-agenda";
import { customerHistory } from "./workshop-customer-history";
import { operationalDashboard } from "./workshop-dashboard";
import { archiveEmbroideryJob, updateEmbroideryJob } from "./workshop-embroidery-jobs";
import { archiveExpense, listExpenses, saveExpense } from "./workshop-expenses";
import { listFinishedStock, saveFinishedStock } from "./workshop-finished-stock";
import { readyForDelivery, startAssembly } from "./workshop-material-use";
import { archivePurchase, createPurchase, listPurchases, updatePurchase } from "./workshop-purchases";
import { moneySummary } from "./workshop-money";
import { archiveProvider, listProviders, saveProvider } from "./workshop-providers";
import { listSizeConsumption, saveSizeConsumption } from "./workshop-size-consumption";
import { archiveManualStockEntry, createManualStockAdjustment, editManualStockEntry, listManualStockEntries } from "./workshop-stock-entries";

const base = "/api/workshop/";
const orderAction = /^\/api\/workshop\/orders\/([0-9a-f-]+)\/(assembly|ready-delivery)$/i;
const embroideryJobAction = /^\/api\/workshop\/embroidery-jobs\/([0-9a-f-]+)$/i;
const customerHistoryAction = /^\/api\/workshop\/customers\/([0-9a-f-]+)\/history$/i;
const staticPaths = ["/api/workshop/dashboard","/api/workshop/agenda","/api/workshop/money","/api/workshop/purchases","/api/workshop/expenses","/api/workshop/providers","/api/workshop/size-consumption","/api/workshop/finished-stock","/api/workshop/stock-entries"];

export function isWorkshopOperationsRequest(request: Request) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(base)) return false;
  if (orderAction.test(path) || embroideryJobAction.test(path) || customerHistoryAction.test(path)) return true;
  return staticPaths.includes(path);
}

function json(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }

export async function handleWorkshopOperations(request: Request, user: AuthUser) {
  const path = new URL(request.url).pathname;
  const customerMatch = path.match(customerHistoryAction);
  if (customerMatch && request.method === "GET") return customerHistory(user, customerMatch[1]);
  const actionMatch = path.match(orderAction);
  if (actionMatch && request.method === "POST") return actionMatch[2] === "assembly" ? startAssembly(user,actionMatch[1]) : readyForDelivery(user,actionMatch[1]);
  const jobMatch = path.match(embroideryJobAction);
  if (jobMatch && request.method === "POST") {
    const body = await request.clone().json().catch(() => null) as { action?: string } | null;
    if (body?.action === "archive") return archiveEmbroideryJob(request,user,jobMatch[1]);
    if (body?.action === "update") return updateEmbroideryJob(request,user,jobMatch[1]);
  }
  if (path === "/api/workshop/dashboard" && request.method === "GET") return operationalDashboard(user);
  if (path === "/api/workshop/agenda" && request.method === "GET") return workshopAgenda(user);
  if (path === "/api/workshop/money" && request.method === "GET") return moneySummary(request, user);
  if (path === "/api/workshop/stock-entries") {
    if (request.method === "GET") return listManualStockEntries(user);
    if (request.method === "POST") {
      const body = await request.clone().json().catch(() => null) as { action?: string } | null;
      if (body?.action === "create") return createManualStockAdjustment(request,user);
      if (body?.action === "archive") return archiveManualStockEntry(request,user);
      if (body?.action === "update") return editManualStockEntry(request,user);
    }
  }
  if (path === "/api/workshop/finished-stock") { if (request.method === "GET") return listFinishedStock(user); if (request.method === "POST") return saveFinishedStock(request,user); }
  if (path === "/api/workshop/size-consumption") { if (request.method === "GET") return listSizeConsumption(user); if (request.method === "POST") return saveSizeConsumption(request, user); }
  if (path === "/api/workshop/providers") { if (request.method === "GET") return listProviders(user); if (request.method === "POST") { const body = await request.clone().json().catch(() => null) as { action?: string } | null; if (body?.action === "archive") return archiveProvider(request, user); return saveProvider(request, user); } }
  if (path === "/api/workshop/purchases") { if (request.method === "GET") return listPurchases(user); if (request.method === "POST") { const body = await request.clone().json().catch(() => null) as { action?: string } | null; if (body?.action === "archive") return archivePurchase(request, user); if (body?.action === "update") return updatePurchase(request, user); return createPurchase(request, user); } }
  if (path === "/api/workshop/expenses") { if (request.method === "GET") return listExpenses(user); if (request.method === "POST") { const body = await request.clone().json().catch(() => null) as { action?: string } | null; if (body?.action === "archive") return archiveExpense(request, user); return saveExpense(request, user); } }
  return json({ error: "No encontrado" }, 404);
}
