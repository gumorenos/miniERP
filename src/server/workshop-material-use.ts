import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { orders, orderStatusHistory, stockMovements } from "../db/schema";
import { canTransitionOrder } from "../domain/order";
import type { OrderStatus } from "../domain/types";
import type { AuthUser } from "./auth";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function currentStock(materialId: string) {
  const result = await db.execute(sql`select coalesce(sum(quantity_signed),0) as qty from stock_movements where material_id=${materialId}::uuid`);
  return Number(result.rows[0]?.qty ?? 0);
}

async function snapshot(orderId: string, businessId: string) {
  const result = await db.execute(sql`
    select o.id as order_id, o.status, oi.id as item_id,
           oi.closure_material_id, oi.planned_closure_qty,
           oi.packaging_material_id, oi.planned_packaging_qty
    from orders o join order_items oi on oi.order_id=o.id
    where o.id=${orderId}::uuid and o.business_id=${businessId}::uuid
    limit 1
  `);
  return result.rows[0] ?? null;
}

async function consumeAndTransition(input: { user: AuthUser; orderId: string; target: "ASSEMBLY" | "READY_FOR_DELIVERY"; kind: "closure" | "packaging" }) {
  const row = await snapshot(input.orderId, input.user.businessId);
  if (!row) return json({ error: "Pedido no encontrado" },404);
  const from = String(row.status) as OrderStatus;
  if (!canTransitionOrder(from,input.target)) return json({ error:`No se puede cambiar el pedido de ${from} a ${input.target}` },409);

  const materialId = input.kind === "closure" ? row.closure_material_id : row.packaging_material_id;
  const quantity = Number(input.kind === "closure" ? row.planned_closure_qty ?? 0 : row.planned_packaging_qty ?? 0);
  const movementType = input.kind === "closure" ? "ORDER_CLOSURE_CONSUMPTION" : "ORDER_PACKAGING_CONSUMPTION";
  let existing = false;
  if (materialId && quantity > 0) {
    const check = await db.select({id:stockMovements.id}).from(stockMovements).where(and(eq(stockMovements.orderItemId,String(row.item_id)),eq(stockMovements.type,movementType))).limit(1);
    existing = check.length > 0;
    if (!existing && await currentStock(String(materialId)) + 0.0001 < quantity) {
      return json({ error:`Stock insuficiente para consumir ${input.kind === "closure" ? "el cierre" : "el empaque"}. Disponible: ${await currentStock(String(materialId))}` },409);
    }
  }

  await db.transaction(async(tx)=>{
    if (materialId && quantity>0 && !existing) {
      await tx.insert(stockMovements).values({ businessId:input.user.businessId, materialId:String(materialId), type:movementType, quantitySigned:String(-quantity), orderItemId:String(row.item_id), notes:input.kind === "closure" ? "Consumo de cierre en confección" : "Consumo de empaque al preparar entrega" });
    }
    if (from !== input.target) {
      await tx.update(orders).set({status:input.target,updatedAt:new Date()}).where(eq(orders.id,input.orderId));
      await tx.insert(orderStatusHistory).values({orderId:input.orderId,fromStatus:from,toStatus:input.target,note:input.kind === "closure" ? "Confección iniciada" : "Pedido preparado para entrega"});
    }
  });
  return json({ok:true,status:input.target,consumed:materialId&&quantity>0&&!existing?quantity:0,alreadyConsumed:existing});
}

export function startAssembly(user: AuthUser, orderId: string) {
  return consumeAndTransition({user,orderId,target:"ASSEMBLY",kind:"closure"});
}

export function readyForDelivery(user: AuthUser, orderId: string) {
  return consumeAndTransition({user,orderId,target:"READY_FOR_DELIVERY",kind:"packaging"});
}
