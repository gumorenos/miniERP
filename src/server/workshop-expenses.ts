import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { expenses, orders } from "../db/schema";
import { limaBusinessDate } from "../domain/workshop";
import type { AuthUser } from "./auth";

const categories = ["EMBROIDERY", "TRANSPORT", "PACKAGING", "TOOLS", "SERVICES", "MARKETING", "OTHER"] as const;
const schema = z.object({
  id: z.string().uuid().optional(),
  action: z.enum(["create", "update"]).default("create"),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.enum(categories),
  description: z.string().trim().min(2).max(200),
  amount: z.coerce.number().positive(),
  paymentMethod: z.string().trim().max(80).optional().nullable(),
  orderId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  notes: z.string().trim().max(500).optional().nullable()
});
const archiveSchema = z.object({ action: z.literal("archive"), id: z.string().uuid() });

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function activeExpense(businessId: string, id: string) {
  const result = await db.execute(sql`
    select e.*
    from expenses e
    where e.id = ${id}::uuid and e.business_id = ${businessId}::uuid
      and not exists (
        select 1 from deleted_records d where d.business_id = e.business_id and d.entity_type = 'EXPENSE' and d.entity_id = e.id
      )
    limit 1
  `);
  return result.rows[0] ?? null;
}

async function validateOrder(businessId: string, orderId?: string | null) {
  if (!orderId) return true;
  const [order] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, orderId), eq(orders.businessId, businessId))).limit(1);
  return Boolean(order);
}

export async function listExpenses(user: AuthUser) {
  const result = await db.execute(sql`
    select e.id, e.expense_date, e.category, e.description, e.amount, e.payment_method, e.order_id, e.notes, o.order_number
    from expenses e
    left join orders o on o.id = e.order_id
    where e.business_id = ${user.businessId}::uuid
      and not exists (
        select 1 from deleted_records d where d.business_id = e.business_id and d.entity_type = 'EXPENSE' and d.entity_id = e.id
      )
    order by e.expense_date desc, e.created_at desc
  `);
  return json({ rows: result.rows.map((row) => ({
    id: String(row.id), expenseDate: String(row.expense_date), category: String(row.category), description: String(row.description),
    amount: Number(row.amount), paymentMethod: row.payment_method == null ? null : String(row.payment_method),
    orderId: row.order_id == null ? null : String(row.order_id), orderNumber: row.order_number == null ? null : String(row.order_number), notes: row.notes == null ? null : String(row.notes)
  })) });
}

export async function saveExpense(request: Request, user: AuthUser) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisa fecha, categoría, descripción e importe del gasto" }, 400);
  const body = parsed.data;
  const orderId = body.orderId || null;
  if (!(await validateOrder(user.businessId, orderId))) return json({ error: "El pedido asociado no pertenece al negocio" }, 400);

  if (body.action === "update") {
    if (!body.id) return json({ error: "Indica el gasto a editar" }, 400);
    if (!(await activeExpense(user.businessId, body.id))) return json({ error: "Gasto no encontrado o borrado" }, 404);
    const [updated] = await db.update(expenses).set({
      expenseDate: body.expenseDate ?? limaBusinessDate(), category: body.category, description: body.description,
      amount: String(body.amount), paymentMethod: body.paymentMethod || null, orderId, notes: body.notes || null
    }).where(and(eq(expenses.id, body.id), eq(expenses.businessId, user.businessId))).returning();
    return json(updated);
  }

  const [created] = await db.insert(expenses).values({
    businessId: user.businessId, expenseDate: body.expenseDate ?? limaBusinessDate(), category: body.category,
    description: body.description, amount: String(body.amount), paymentMethod: body.paymentMethod || null, orderId, notes: body.notes || null
  }).returning();
  return json(created, 201);
}

export async function archiveExpense(request: Request, user: AuthUser) {
  const parsed = archiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Gasto inválido" }, 400);
  const current = await activeExpense(user.businessId, parsed.data.id);
  if (!current) return json({ error: "Gasto no encontrado" }, 404);
  await db.execute(sql`
    insert into deleted_records (business_id, entity_type, entity_id, snapshot)
    values (${user.businessId}::uuid, 'EXPENSE', ${parsed.data.id}::uuid, ${JSON.stringify(current)}::jsonb)
    on conflict (business_id, entity_type, entity_id) do nothing
  `);
  return json({ ok: true });
}
