import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { embroideryJobs, embroideryProviders } from "../db/schema";
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
  const result = await db.execute(sql`select 1 from deleted_records where business_id=${businessId}::uuid and entity_type='PROVIDER' and entity_id=${id}::uuid limit 1`);
  return result.rows.length > 0;
}

export async function listProviders(user: AuthUser) {
  const result = await db.execute(sql`
    select ep.id, ep.name, ep.phone, ep.notes, ep.active
    from embroidery_providers ep
    where ep.business_id=${user.businessId}::uuid and ep.active=true
      and not exists (select 1 from deleted_records d where d.business_id=ep.business_id and d.entity_type='PROVIDER' and d.entity_id=ep.id)
    order by ep.name
  `);
  return json({ rows: result.rows.map((row) => ({ id:String(row.id), name:String(row.name), phone:row.phone==null?null:String(row.phone), notes:row.notes==null?null:String(row.notes) })) });
}

export async function saveProvider(request: Request, user: AuthUser) {
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisa nombre y teléfono del bordador" }, 400);
  const body = parsed.data;
  if (body.action === "update") {
    if (!body.id) return json({ error: "Indica el bordador a editar" }, 400);
    if (await archived(user.businessId, body.id)) return json({ error: "El bordador fue borrado" }, 409);
    const [row] = await db.select().from(embroideryProviders).where(and(eq(embroideryProviders.id, body.id), eq(embroideryProviders.businessId, user.businessId))).limit(1);
    if (!row) return json({ error: "Bordador no encontrado" }, 404);
    const [updated] = await db.update(embroideryProviders).set({ name:body.name, phone:body.phone||null, notes:body.notes||null, updatedAt:new Date() }).where(eq(embroideryProviders.id,row.id)).returning();
    return json(updated);
  }
  const [created] = await db.insert(embroideryProviders).values({ businessId:user.businessId, name:body.name, phone:body.phone||null, notes:body.notes||null }).returning();
  return json(created,201);
}

export async function archiveProvider(request: Request, user: AuthUser) {
  const parsed = archiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Bordador inválido" }, 400);
  const [row] = await db.select().from(embroideryProviders).where(and(eq(embroideryProviders.id,parsed.data.id),eq(embroideryProviders.businessId,user.businessId))).limit(1);
  if (!row) return json({ error: "Bordador no encontrado" },404);
  const active = await db.select({id:embroideryJobs.id}).from(embroideryJobs).where(and(eq(embroideryJobs.providerId,row.id),eq(embroideryJobs.status,"SENT"))).limit(1);
  if (active.length) return json({ error: "Este bordador tiene trabajos pendientes de devolución" },409);
  await db.transaction(async (tx) => {
    await tx.execute(sql`insert into deleted_records (business_id,entity_type,entity_id,snapshot) values (${user.businessId}::uuid,'PROVIDER',${row.id}::uuid,${JSON.stringify(row)}::jsonb) on conflict (business_id,entity_type,entity_id) do nothing`);
    await tx.update(embroideryProviders).set({active:false,updatedAt:new Date()}).where(eq(embroideryProviders.id,row.id));
  });
  return json({ok:true});
}
