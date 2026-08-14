import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { materials, purchaseLines, purchases, stockMovements } from "../db/schema";
import { limaBusinessDate } from "../domain/workshop";
import type { AuthUser } from "./auth";
import { isArchived } from "./record-archive";

const lineSchema = z.object({ materialId: z.string().uuid(), quantity: z.coerce.number().positive(), totalCost: z.coerce.number().positive() });
const createSchema = z.object({
  action: z.literal("create").optional(), purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), supplierName: z.string().trim().max(160).optional().nullable(),
  paymentMethod: z.string().trim().max(80).optional().nullable(), notes: z.string().trim().max(500).optional().nullable(), lines: z.array(lineSchema).min(1).max(20)
});
const updateSchema = z.object({
  action: z.literal("update"), id: z.string().uuid(), purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), supplierName: z.string().trim().max(160).optional().nullable(),
  paymentMethod: z.string().trim().max(80).optional().nullable(), notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(z.object({ id: z.string().uuid(), quantity: z.coerce.number().positive(), totalCost: z.coerce.number().positive() })).optional()
});
const archiveSchema = z.object({ action: z.literal("archive"), id: z.string().uuid() });

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function purchaseArchived(businessId: string, id: string) {
  const result = await db.execute(sql`select 1 from deleted_records where business_id=${businessId}::uuid and entity_type='PURCHASE' and entity_id=${id}::uuid limit 1`);
  return result.rows.length > 0;
}

async function materialForBusiness(businessId: string, id: string) {
  if (await isArchived(businessId, "MATERIAL", id)) return null;
  const [row] = await db.select().from(materials).where(and(eq(materials.id, id), eq(materials.businessId, businessId))).limit(1);
  return row ?? null;
}

async function currentStock(materialId: string) {
  const [row] = await db.select({ qty: sql<string>`coalesce(sum(${stockMovements.quantitySigned}), 0)` }).from(stockMovements).where(eq(stockMovements.materialId, materialId));
  return Number(row?.qty ?? 0);
}

async function purchaseDetail(businessId: string, id: string) {
  const [purchase] = await db.select().from(purchases).where(and(eq(purchases.id, id), eq(purchases.businessId, businessId))).limit(1);
  if (!purchase) return null;
  const lines = await db.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, purchase.id)).orderBy(asc(purchaseLines.id));
  return { ...purchase, lines };
}

function resultRows(rows: readonly Record<string, unknown>[]) {
  return rows.map((row) => ({
    id: String(row.id), purchaseDate: String(row.purchase_date), supplierName: row.supplier_name == null ? null : String(row.supplier_name),
    totalAmount: Number(row.total_amount), paymentMethod: row.payment_method == null ? null : String(row.payment_method), notes: row.notes == null ? null : String(row.notes),
    lines: Array.isArray(row.lines) ? row.lines : []
  }));
}

export async function listPurchases(user: AuthUser) {
  const rows = await db.execute(sql`
    select p.id, p.purchase_date, p.supplier_name, p.total_amount, p.payment_method, p.notes,
           coalesce(json_agg(json_build_object('id',pl.id,'materialId',pl.material_id,'materialName',m.name,'quantity',pl.quantity,'totalCost',pl.total_cost,'unitCost',pl.unit_cost) order by m.name) filter (where pl.id is not null), '[]'::json) as lines
    from purchases p left join purchase_lines pl on pl.purchase_id=p.id left join materials m on m.id=pl.material_id
    where p.business_id=${user.businessId}::uuid
      and not exists (select 1 from deleted_records d where d.business_id=p.business_id and d.entity_type='PURCHASE' and d.entity_id=p.id)
    group by p.id order by p.purchase_date desc,p.created_at desc
  `);
  return json({ rows: resultRows(rows.rows as Record<string, unknown>[]) });
}

export async function createPurchase(request: Request, user: AuthUser) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisa fecha, materiales, cantidades y costos de la compra" }, 400);
  const seen = new Set<string>();
  for (const line of parsed.data.lines) {
    if (seen.has(line.materialId)) return json({ error: "Agrupa cada material en una sola línea de compra" }, 400);
    seen.add(line.materialId);
    if (!(await materialForBusiness(user.businessId, line.materialId))) return json({ error: "Uno de los materiales no pertenece al negocio o fue borrado" }, 400);
  }
  const total = parsed.data.lines.reduce((sum, line) => sum + line.totalCost, 0);
  const id = await db.transaction(async (tx) => {
    const [purchase] = await tx.insert(purchases).values({ businessId:user.businessId,purchaseDate:parsed.data.purchaseDate??limaBusinessDate(),supplierName:parsed.data.supplierName||null,totalAmount:String(total),paymentMethod:parsed.data.paymentMethod||null,notes:parsed.data.notes||null }).returning();
    for (const line of parsed.data.lines) {
      const unitCost = line.totalCost / line.quantity;
      const [createdLine] = await tx.insert(purchaseLines).values({ purchaseId:purchase.id,materialId:line.materialId,quantity:String(line.quantity),totalCost:String(line.totalCost),unitCost:String(unitCost) }).returning();
      await tx.insert(stockMovements).values({ businessId:user.businessId,materialId:line.materialId,type:"PURCHASE",quantitySigned:String(line.quantity),unitCost:String(unitCost),purchaseLineId:createdLine.id,notes:purchase.supplierName?`Compra a ${purchase.supplierName}`:"Compra de material" });
    }
    return purchase.id;
  });
  return json(await purchaseDetail(user.businessId,id),201);
}

export async function updatePurchase(request: Request, user: AuthUser) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisa los datos de la compra" }, 400);
  if (await purchaseArchived(user.businessId, parsed.data.id)) return json({ error: "La compra fue borrada" }, 409);
  const current = await purchaseDetail(user.businessId, parsed.data.id);
  if (!current) return json({ error: "Compra no encontrada" }, 404);

  const updates = new Map((parsed.data.lines ?? []).map((line) => [line.id, line]));
  for (const id of updates.keys()) if (!current.lines.some((line) => line.id === id)) return json({ error: "Línea de compra inválida" }, 400);

  if (updates.size) {
    const movements = await db.select().from(stockMovements).where(inArray(stockMovements.purchaseLineId, [...updates.keys()]));
    for (const line of current.lines) {
      const correction = updates.get(line.id);
      if (!correction) continue;
      const movement = movements.find((row) => row.purchaseLineId === line.id);
      if (!movement) return json({ error: "La compra perdió su movimiento de inventario y no puede editarse de forma segura" }, 409);
      const available = await currentStock(line.materialId);
      const projected = available - Number(movement.quantitySigned) + correction.quantity;
      if (projected < -0.0001) return json({ error: `No puedes reducir esta compra a ${correction.quantity}; el stock de ${line.materialId} quedaría negativo` }, 409);
    }
  }

  await db.transaction(async (tx) => {
    let total = 0;
    for (const line of current.lines) {
      const correction = updates.get(line.id);
      const quantity = correction?.quantity ?? Number(line.quantity);
      const totalCost = correction?.totalCost ?? Number(line.totalCost);
      const unitCost = totalCost / quantity;
      total += totalCost;
      if (correction) {
        await tx.update(purchaseLines).set({ quantity:String(quantity),totalCost:String(totalCost),unitCost:String(unitCost) }).where(eq(purchaseLines.id,line.id));
        await tx.update(stockMovements).set({ quantitySigned:String(quantity),unitCost:String(unitCost) }).where(eq(stockMovements.purchaseLineId,line.id));
      }
    }
    await tx.update(purchases).set({
      ...(parsed.data.purchaseDate!==undefined?{purchaseDate:parsed.data.purchaseDate}:{}), ...(parsed.data.supplierName!==undefined?{supplierName:parsed.data.supplierName||null}:{}),
      ...(parsed.data.paymentMethod!==undefined?{paymentMethod:parsed.data.paymentMethod||null}:{}), ...(parsed.data.notes!==undefined?{notes:parsed.data.notes||null}:{}), totalAmount:String(total)
    }).where(eq(purchases.id,current.id));
  });
  return json(await purchaseDetail(user.businessId,current.id));
}

export async function archivePurchase(request: Request, user: AuthUser) {
  const parsed = archiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Compra inválida" }, 400);
  if (await purchaseArchived(user.businessId, parsed.data.id)) return json({ ok:true,alreadyArchived:true });
  const current = await purchaseDetail(user.businessId,parsed.data.id);
  if (!current) return json({ error:"Compra no encontrada" },404);
  const lineIds=current.lines.map((line)=>line.id);
  if(lineIds.length){
    const movements=await db.select().from(stockMovements).where(inArray(stockMovements.purchaseLineId,lineIds));
    for(const line of current.lines){const movement=movements.find((row)=>row.purchaseLineId===line.id);if(!movement)continue;const after=await currentStock(line.materialId)-Number(movement.quantitySigned);if(after < -0.0001)return json({error:"No se puede borrar esta compra porque el material ya fue consumido y el stock quedaría negativo"},409);}
  }
  await db.transaction(async(tx)=>{
    await tx.execute(sql`insert into deleted_records (business_id,entity_type,entity_id,snapshot) values (${user.businessId}::uuid,'PURCHASE',${current.id}::uuid,${JSON.stringify(current)}::jsonb) on conflict (business_id,entity_type,entity_id) do nothing`);
    if(lineIds.length)await tx.update(stockMovements).set({quantitySigned:"0"}).where(inArray(stockMovements.purchaseLineId,lineIds));
  });
  return json({ok:true});
}
