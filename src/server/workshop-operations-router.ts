import type { AuthUser } from "./auth";
import { workshopAgenda } from "./workshop-agenda";
import { archiveExpense, listExpenses, saveExpense } from "./workshop-expenses";
import { readyForDelivery, startAssembly } from "./workshop-material-use";
import { archivePurchase, createPurchase, listPurchases, updatePurchase } from "./workshop-purchases";
import { moneySummary } from "./workshop-money";
import { archiveProvider, listProviders, saveProvider } from "./workshop-providers";
import { listSizeConsumption, saveSizeConsumption } from "./workshop-size-consumption";

const base = "/api/workshop/";
const orderAction = /^\/api\/workshop\/orders\/([0-9a-f-]+)\/(assembly|ready-delivery)$/i;

export function isWorkshopOperationsRequest(request: Request) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(base)) return false;
  if (orderAction.test(path)) return true;
  return ["/api/workshop/agenda","/api/workshop/money","/api/workshop/purchases","/api/workshop/expenses","/api/workshop/providers","/api/workshop/size-consumption"].includes(path);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function handleWorkshopOperations(request: Request, user: AuthUser) {
  const path = new URL(request.url).pathname;
  const actionMatch = path.match(orderAction);
  if (actionMatch && request.method === "POST") return actionMatch[2] === "assembly" ? startAssembly(user,actionMatch[1]) : readyForDelivery(user,actionMatch[1]);
  if (path === "/api/workshop/agenda" && request.method === "GET") return workshopAgenda(user);
  if (path === "/api/workshop/money" && request.method === "GET") return moneySummary(request, user);
  if (path === "/api/workshop/size-consumption") {
    if (request.method === "GET") return listSizeConsumption(user);
    if (request.method === "POST") return saveSizeConsumption(request, user);
  }
  if (path === "/api/workshop/providers") {
    if (request.method === "GET") return listProviders(user);
    if (request.method === "POST") {
      const body = await request.clone().json().catch(() => null) as { action?: string } | null;
      if (body?.action === "archive") return archiveProvider(request, user);
      return saveProvider(request, user);
    }
  }
  if (path === "/api/workshop/purchases") {
    if (request.method === "GET") return listPurchases(user);
    if (request.method === "POST") {
      const body = await request.clone().json().catch(() => null) as { action?: string } | null;
      if (body?.action === "archive") return archivePurchase(request, user);
      if (body?.action === "update") return updatePurchase(request, user);
      return createPurchase(request, user);
    }
  }
  if (path === "/api/workshop/expenses") {
    if (request.method === "GET") return listExpenses(user);
    if (request.method === "POST") {
      const body = await request.clone().json().catch(() => null) as { action?: string } | null;
      if (body?.action === "archive") return archiveExpense(request, user);
      return saveExpense(request, user);
    }
  }
  return json({ error: "No encontrado" }, 404);
}
