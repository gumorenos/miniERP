import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { orderItems, orders, orderStatusHistory, stockMovements } from "../db/schema";
import { canTransitionOrder } from "../domain/order";
import type { OrderStatus } from "../domain/types";
import type { AuthUser } from "./auth";
import type { DbTransaction } from "./order-number";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function currentStock(tx: DbTransaction, businessId: string, materialId: string) {
  const [row] = await tx.select({ qty: sql<string>`coalesce(sum(${stockMovements.quantitySigned}),0)` }).from(stockMovements).where(and(eq(stockMovements.businessId, businessId), eq(stockMovements.materialId, materialId)));
  return Number(row?.qty ?? 0);
}

async function consumeAndTransition(input: { user: AuthUser; orderId: string; target: "ASSEMBLY" | "READY_FOR_DELIVERY"; kind: "closure" | "packaging" }) {
  let consumed = 0;
  let alreadyConsumed = false;
  try {
    await db.transaction(async (tx) => {
      const [order] = await tx.select({ id: orders.id, status: orders.status }).from(orders).where(and(eq(orders.id, input.orderId), eq(orders.businessId, input.user.businessId))).for("update").limit(1);
      if (!order) throw new WorkshopOperationError("Pedido no encontrado", 404);
      const from = order.status as OrderStatus;
      const allowedSources = input.target === "ASSEMBLY" ? ["CUT", "EMBROIDERY_RECEIVED", "ASSEMBLY"] : ["ASSEMBLY", "READY_FOR_DELIVERY"];
      if (!allowedSources.includes(from)) {
        const expected = input.target === "ASSEMBLY" ? "cortado o con bordado recibido" : "en confección";
        throw new WorkshopOperationError(`El pedido debe estar ${expected} antes de esta acción`, 409);
      }
      if (!canTransitionOrder(from, input.target)) throw new WorkshopOperationError(`No se puede cambiar el pedido de ${from} a ${input.target}`, 409);
      const [item] = await tx.select({
        id: orderItems.id,
        closureMaterialId: orderItems.closureMaterialId,
        plannedClosureQty: orderItems.plannedClosureQty,
        packagingMaterialId: orderItems.packagingMaterialId,
        plannedPackagingQty: orderItems.plannedPackagingQty
      }).from(orderItems).where(eq(orderItems.orderId, order.id)).limit(1);
      if (!item) throw new WorkshopOperationError("Pedido sin item", 422);

      const materialId = input.kind === "closure" ? item.closureMaterialId : item.packagingMaterialId;
      const quantity = Number(input.kind === "closure" ? item.plannedClosureQty ?? 0 : item.plannedPackagingQty ?? 0);
      const movementType = input.kind === "closure" ? "ORDER_CLOSURE_CONSUMPTION" : "ORDER_PACKAGING_CONSUMPTION";
      if (materialId && quantity > 0) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${materialId}))`);
        const check = await tx.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.orderItemId, item.id), eq(stockMovements.type, movementType))).limit(1);
        alreadyConsumed = check.length > 0;
        if (!alreadyConsumed) {
          const available = await currentStock(tx, input.user.businessId, materialId);
          if (available + 0.0001 < quantity) throw new WorkshopOperationError(`Stock insuficiente para consumir ${input.kind === "closure" ? "el cierre" : "el empaque"}. Disponible: ${available}`, 409);
          await tx.insert(stockMovements).values({ businessId: input.user.businessId, materialId, type: movementType, quantitySigned: String(-quantity), orderItemId: item.id, notes: input.kind === "closure" ? "Consumo de cierre en confección" : "Consumo de empaque al preparar entrega" });
          consumed = quantity;
        }
      }
      if (from !== input.target) {
        await tx.update(orders).set({ status: input.target, updatedAt: new Date() }).where(and(eq(orders.id, input.orderId), eq(orders.status, from)));
        await tx.insert(orderStatusHistory).values({ orderId: input.orderId, fromStatus: from, toStatus: input.target, note: input.kind === "closure" ? "Confección iniciada" : "Pedido preparado para entrega" });
      }
    });
  } catch (error) {
    if (error instanceof WorkshopOperationError) return json({ error: error.message }, error.status);
    throw error;
  }
  return json({ ok: true, status: input.target, consumed, alreadyConsumed });
}

class WorkshopOperationError extends Error {
  constructor(message: string, public readonly status: 404 | 409 | 422) { super(message); }
}

export function startAssembly(user: AuthUser, orderId: string) {
  return consumeAndTransition({ user, orderId, target: "ASSEMBLY", kind: "closure" });
}

export function readyForDelivery(user: AuthUser, orderId: string) {
  return consumeAndTransition({ user, orderId, target: "READY_FOR_DELIVERY", kind: "packaging" });
}
