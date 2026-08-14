import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { orderItems, orders, orderStatusHistory, stockMovements } from "../db/schema";
import { canTransitionOrder } from "../domain/order";
import type { OrderStatus } from "../domain/types";
import type { AuthUser } from "./auth";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function currentStock(materialId: string) {
  const [row] = await db.select({ qty: sql<string>`coalesce(sum(${stockMovements.quantitySigned}),0)` }).from(stockMovements).where(eq(stockMovements.materialId, materialId));
  return Number(row?.qty ?? 0);
}

async function snapshot(orderId: string, businessId: string) {
  const [order] = await db.select({ id: orders.id, status: orders.status }).from(orders).where(and(eq(orders.id, orderId), eq(orders.businessId, businessId))).limit(1);
  if (!order) return null;
  const [item] = await db.select({
    id: orderItems.id,
    closureMaterialId: orderItems.closureMaterialId,
    plannedClosureQty: orderItems.plannedClosureQty,
    packagingMaterialId: orderItems.packagingMaterialId,
    plannedPackagingQty: orderItems.plannedPackagingQty
  }).from(orderItems).where(eq(orderItems.orderId, order.id)).limit(1);
  if (!item) return null;
  return { order, item };
}

async function consumeAndTransition(input: { user: AuthUser; orderId: string; target: "ASSEMBLY" | "READY_FOR_DELIVERY"; kind: "closure" | "packaging" }) {
  const row = await snapshot(input.orderId, input.user.businessId);
  if (!row) return json({ error: "Pedido no encontrado" }, 404);
  const from = row.order.status as OrderStatus;
  const allowedSources = input.target === "ASSEMBLY" ? ["CUT", "EMBROIDERY_RECEIVED", "ASSEMBLY"] : ["ASSEMBLY", "READY_FOR_DELIVERY"];
  if (!allowedSources.includes(from)) {
    const expected = input.target === "ASSEMBLY" ? "cortado o con bordado recibido" : "en confección";
    return json({ error: `El pedido debe estar ${expected} antes de esta acción` }, 409);
  }
  if (!canTransitionOrder(from, input.target)) return json({ error: `No se puede cambiar el pedido de ${from} a ${input.target}` }, 409);

  const materialId = input.kind === "closure" ? row.item.closureMaterialId : row.item.packagingMaterialId;
  const quantity = Number(input.kind === "closure" ? row.item.plannedClosureQty ?? 0 : row.item.plannedPackagingQty ?? 0);
  const movementType = input.kind === "closure" ? "ORDER_CLOSURE_CONSUMPTION" : "ORDER_PACKAGING_CONSUMPTION";
  let existing = false;

  if (materialId && quantity > 0) {
    const check = await db.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.orderItemId, row.item.id), eq(stockMovements.type, movementType))).limit(1);
    existing = check.length > 0;
    if (!existing) {
      const available = await currentStock(materialId);
      if (available + 0.0001 < quantity) return json({ error: `Stock insuficiente para consumir ${input.kind === "closure" ? "el cierre" : "el empaque"}. Disponible: ${available}` }, 409);
    }
  }

  await db.transaction(async (tx) => {
    if (materialId && quantity > 0 && !existing) {
      await tx.insert(stockMovements).values({ businessId: input.user.businessId, materialId, type: movementType, quantitySigned: String(-quantity), orderItemId: row.item.id, notes: input.kind === "closure" ? "Consumo de cierre en confección" : "Consumo de empaque al preparar entrega" });
    }
    if (from !== input.target) {
      await tx.update(orders).set({ status: input.target, updatedAt: new Date() }).where(eq(orders.id, input.orderId));
      await tx.insert(orderStatusHistory).values({ orderId: input.orderId, fromStatus: from, toStatus: input.target, note: input.kind === "closure" ? "Confección iniciada" : "Pedido preparado para entrega" });
    }
  });

  return json({ ok: true, status: input.target, consumed: materialId && quantity > 0 && !existing ? quantity : 0, alreadyConsumed: existing });
}

export function startAssembly(user: AuthUser, orderId: string) {
  return consumeAndTransition({ user, orderId, target: "ASSEMBLY", kind: "closure" });
}

export function readyForDelivery(user: AuthUser, orderId: string) {
  return consumeAndTransition({ user, orderId, target: "READY_FOR_DELIVERY", kind: "packaging" });
}
