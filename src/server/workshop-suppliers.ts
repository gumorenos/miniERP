import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { suppliers } from "../db/schema";
import type { AuthUser } from "./auth";

const saveSchema = z.object({
  action: z.enum(["create", "update"]).default("create"),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable()
});

const archiveSchema = z.object({ action: z.literal("archive"), id: z.string().uuid() });

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function archived(businessId: string, id: string) {
  const result = await db.execute(sql`select 1 from deleted_records where business_id=${businessId}::uuid and entity_type='SUPPLIER' and entity_id=${id}::uuid limit 1`);
  return result.rows.length > 0;
}

export async function listSuppliers(user: AuthUser) {
  const result = await db.execute(sql`
    select s.id, s.name, s.phone, s.notes
    from suppliers s
    where s.business_id=${user.businessId}::uuid and s.active=true
      and not exists (select 1 from deleted_records d where d.business_id=s.business_id and d.entity_type='SUPPLIER' and d.entity_id=s.id)
    order by s.name
  `);
  return json({ rows: result.rows.map((row) => ({ id:String(row.id), name:String(row.name), phone:row.phone==null?null:String(row.phone), notes:row.notes==null?null:String(row.notes) })) });
}

export async function saveSupplier(request: Request, user: AuthUser) {
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisa nombre y teléfono del proveedor" }, 400);
  const body = parsed.data;
  if (body.action === "update") {
    if (!body.id) return json({ error: "Indica el proveedor a editar" }, 400);
    if (await archived(user.businessId, body.id)) return json({ error: "El proveedor fue borrado" }, 409);
    const [row] = await db.select().from(suppliers).where(and(eq(suppliers.id, body.id), eq(suppliers.businessId, user.businessId))).limit(1);
    if (!row) return json({ error: "Proveedor no encontrado" }, 404);
    const [updated] = await db.update(suppliers).set({ name:body.name, phone:body.phone||null, notes:body.notes||null, updatedAt:new Date() }).where(eq(suppliers.id,row.id)).returning();
    return json(updated);
  }
  const [created] = await db.insert(suppliers).values({ businessId:user.businessId, name:body.name, phone:body.phone||null, notes:body.notes||null }).returning();
  return json(created, 201);
}

export async function archiveSupplier(request: Request, user: AuthUser) {
  const parsed = archiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Proveedor inválido" }, 400);
  const [row] = await db.select().from(suppliers).where(and(eq(suppliers.id,parsed.data.id),eq(suppliers.businessId,user.businessId))).limit(1);
  if (!row) return json({ error: "Proveedor no encontrado" },404);
  await db.transaction(async (tx) => {
    await tx.execute(sql`insert into deleted_records (business_id,entity_type,entity_id,snapshot) values (${user.businessId}::uuid,'SUPPLIER',${row.id}::uuid,${JSON.stringify(row)}::jsonb) on conflict (business_id,entity_type,entity_id) do nothing`);
    await tx.update(suppliers).set({active:false,updatedAt:new Date()}).where(eq(suppliers.id,row.id));
  });
  return json({ ok:true });
}
