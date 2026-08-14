import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { customers, materials, orderItems, orders, payments, products, stockMovements } from "../db/schema";
import type { AuthUser } from "./auth";

export const archiveEntityTypes = ["CUSTOMER", "PRODUCT", "MATERIAL", "ORDER", "PAYMENT"] as const;
export type ArchiveEntityType = (typeof archiveEntityTypes)[number];
const archiveSchema = z.object({ entityType: z.enum(archiveEntityTypes), id: z.string().uuid() });

function json(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }
async function saveArchive(businessId: string, entityType: ArchiveEntityType, entityId: string, snapshot: unknown) {
  await db.execute(sql`insert into deleted_records (business_id,entity_type,entity_id,snapshot) values (${businessId}::uuid,${entityType},${entityId}::uuid,${JSON.stringify(snapshot)}::jsonb) on conflict (business_id,entity_type,entity_id) do nothing`);
}
export async function isArchived(businessId: string, entityType: ArchiveEntityType, entityId: string) {
  const result = await db.execute(sql`select 1 from deleted_records where business_id=${businessId}::uuid and entity_type=${entityType} and entity_id=${entityId}::uuid limit 1`);
  return result.rows.length > 0;
}

export async function archiveRecord(request: Request, user: AuthUser) {
  const parsed = archiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Registro inválido" }, 400);
  const { entityType, id } = parsed.data;
  if (await isArchived(user.businessId, entityType, id)) return json({ ok: true, alreadyArchived: true });

  if (entityType === "CUSTOMER") {
    const [row] = await db.select().from(customers).where(and(eq(customers.id,id),eq(customers.businessId,user.businessId))).limit(1);
    if (!row) return json({ error:"Cliente no encontrado" },404);
    const activeOrders = await db.select({id:orders.id}).from(orders).where(and(eq(orders.businessId,user.businessId),eq(orders.customerId,row.id),sql`${orders.status} not in ('CLOSED','CANCELLED')`)).limit(1);
    if (activeOrders.length) return json({ error:"El cliente todavía tiene pedidos abiertos o entregados sin cerrar. Ciérralos o cancélalos antes de borrarlo." },409);
    await saveArchive(user.businessId,entityType,id,row); return json({ok:true});
  }

  if (entityType === "PRODUCT") {
    const [row] = await db.select().from(products).where(and(eq(products.id,id),eq(products.businessId,user.businessId))).limit(1);
    if (!row) return json({ error:"Producto no encontrado" },404);
    const activeUse = await db.execute(sql`
      select oi.id from order_items oi join orders o on o.id=oi.order_id
      where o.business_id=${user.businessId}::uuid and oi.product_id=${row.id}::uuid and o.status not in ('CLOSED','CANCELLED')
        and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)
      limit 1
    `);
    if (activeUse.rows.length) return json({ error:"Este producto está usado por un pedido abierto. Cierra o cancela el pedido antes de borrarlo." },409);
    const finished = await db.execute(sql`
      select coalesce(sum(fsm.quantity_signed),0) as qty from finished_stock_movements fsm
      where fsm.business_id=${user.businessId}::uuid and fsm.product_id=${row.id}::uuid
        and not exists (select 1 from deleted_records d where d.business_id=fsm.business_id and d.entity_type='FINISHED_STOCK_MOVEMENT' and d.entity_id=fsm.id)
    `);
    if (Number(finished.rows[0]?.qty ?? 0) !== 0) return json({ error:"Este producto todavía tiene prendas terminadas en stock. Deja el stock en cero antes de borrarlo." },409);
    await saveArchive(user.businessId,entityType,id,row); return json({ok:true});
  }

  if (entityType === "MATERIAL") {
    const [row] = await db.select().from(materials).where(and(eq(materials.id,id),eq(materials.businessId,user.businessId))).limit(1);
    if (!row) return json({ error:"Material no encontrado" },404);
    const references = await db.execute(sql`
      select p.id from products p
      where p.business_id=${user.businessId}::uuid
        and (${row.id}::uuid in (p.default_fabric_material_id,p.default_closure_material_id,p.default_packaging_material_id))
        and not exists (select 1 from deleted_records d where d.business_id=p.business_id and d.entity_type='PRODUCT' and d.entity_id=p.id)
      limit 1
    `);
    if (references.rows.length) return json({ error:"Este material está asignado a un producto activo. Desasígnalo del producto antes de borrarlo." },409);
    const activeOrderUse = await db.execute(sql`
      select oi.id from order_items oi join orders o on o.id=oi.order_id
      where o.business_id=${user.businessId}::uuid
        and ${row.id}::uuid in (oi.fabric_material_id,oi.closure_material_id,oi.packaging_material_id)
        and o.status not in ('CLOSED','CANCELLED')
        and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)
      limit 1
    `);
    if (activeOrderUse.rows.length) return json({ error:"Este material todavía está reservado por un pedido abierto y no puede borrarse." },409);
    const [stock] = await db.select({ qty: sql<string>`coalesce(sum(${stockMovements.quantitySigned}),0)` }).from(stockMovements).where(and(eq(stockMovements.businessId,user.businessId),eq(stockMovements.materialId,row.id)));
    if (Math.abs(Number(stock?.qty ?? 0)) > 0.0001) return json({ error:"Este material todavía tiene stock físico. Registra un ajuste hasta dejarlo en cero antes de borrarlo." },409);
    await saveArchive(user.businessId,entityType,id,row); return json({ok:true});
  }

  if (entityType === "PAYMENT") {
    const [row] = await db.select().from(payments).where(and(eq(payments.id,id),eq(payments.businessId,user.businessId))).limit(1);
    if (!row) return json({ error:"Pago no encontrado" },404);
    await db.transaction(async(tx)=>{
      await tx.execute(sql`insert into deleted_records (business_id,entity_type,entity_id,snapshot) values (${user.businessId}::uuid,${entityType},${id}::uuid,${JSON.stringify(row)}::jsonb) on conflict (business_id,entity_type,entity_id) do nothing`);
      await tx.update(payments).set({amount:"0"}).where(eq(payments.id,id));
    });
    return json({ok:true});
  }

  const [order] = await db.select().from(orders).where(and(eq(orders.id,id),eq(orders.businessId,user.businessId))).limit(1);
  if (!order) return json({ error:"Pedido no encontrado" },404);
  if (!["ORDER_RECEIVED","MATERIAL_PENDING","READY_TO_CUT","CANCELLED"].includes(order.status)) return json({ error:"Este pedido ya avanzó en producción. Cancélalo y conserva su historial en lugar de borrarlo." },409);
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId,order.id));
  const itemIds = items.map((item)=>item.id);
  const paymentRows = await db.select().from(payments).where(and(eq(payments.orderId,order.id),eq(payments.businessId,user.businessId)));
  const activePaid = paymentRows.reduce((sum,payment)=>sum+Number(payment.amount),0);
  if (activePaid > 0) return json({ error:"El pedido tiene pagos. Borra o corrige esos pagos antes de borrar el pedido." },409);
  if (itemIds.length) {
    const movements = await db.select({id:stockMovements.id}).from(stockMovements).where(inArray(stockMovements.orderItemId,itemIds)).limit(1);
    if (movements.length) return json({ error:"El pedido ya afectó inventario y no puede borrarse." },409);
    const jobs = await db.execute(sql`
      select ej.id from embroidery_jobs ej
      where ej.order_item_id = any(${itemIds}::uuid[])
        and not exists (select 1 from deleted_records d where d.business_id=${user.businessId}::uuid and d.entity_type='EMBROIDERY_JOB' and d.entity_id=ej.id)
      limit 1
    `);
    if (jobs.rows.length) return json({ error:"El pedido todavía tiene trabajo de bordado y no puede borrarse." },409);
  }
  await db.transaction(async(tx)=>{
    await tx.execute(sql`insert into deleted_records (business_id,entity_type,entity_id,snapshot) values (${user.businessId}::uuid,${entityType},${id}::uuid,${JSON.stringify({order,items,payments:paymentRows})}::jsonb) on conflict (business_id,entity_type,entity_id) do nothing`);
    await tx.update(orders).set({status:"CANCELLED",agreedTotalPrice:"0",updatedAt:new Date()}).where(eq(orders.id,order.id));
    if(itemIds.length)await tx.update(orderItems).set({agreedUnitPrice:"0",estimatedMaterialCost:"0",estimatedOwnLaborCost:"0",estimatedPackagingCost:"0",otherEstimatedDirectCost:"0"}).where(inArray(orderItems.id,itemIds));
  });
  return json({ok:true});
}
