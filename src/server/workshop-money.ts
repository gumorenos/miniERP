import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { limaBusinessDate } from "../domain/workshop";
import type { AuthUser } from "./auth";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function monthRange(value?: string | null) {
  const month = value && /^\d{4}-\d{2}$/.test(value) ? value : limaBusinessDate().slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const next = monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
  return { month, start: `${month}-01`, next };
}

export async function moneySummary(request: Request, user: AuthUser) {
  const { month, start, next } = monthRange(new URL(request.url).searchParams.get("month"));
  const [salesResult, collectedResult, purchaseResult, expenseResult, receivableResult] = await Promise.all([
    db.execute(sql`
      select coalesce(sum(o.agreed_total_price),0) as value
      from orders o
      where o.business_id=${user.businessId}::uuid and o.order_date >= ${start}::date and o.order_date < ${next}::date
        and o.status <> 'CANCELLED'
        and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)
    `),
    db.execute(sql`
      select coalesce(sum(p.amount),0) as value
      from payments p join orders o on o.id=p.order_id
      where p.business_id=${user.businessId}::uuid and (p.paid_at at time zone 'America/Lima')::date >= ${start}::date and (p.paid_at at time zone 'America/Lima')::date < ${next}::date
        and not exists (select 1 from deleted_records d where d.business_id=p.business_id and d.entity_type='PAYMENT' and d.entity_id=p.id)
        and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)
    `),
    db.execute(sql`
      select coalesce(sum(p.total_amount),0) as value
      from purchases p
      where p.business_id=${user.businessId}::uuid and p.purchase_date >= ${start}::date and p.purchase_date < ${next}::date
        and not exists (select 1 from deleted_records d where d.business_id=p.business_id and d.entity_type='PURCHASE' and d.entity_id=p.id)
    `),
    db.execute(sql`
      select coalesce(sum(e.amount),0) as value
      from expenses e
      where e.business_id=${user.businessId}::uuid and e.expense_date >= ${start}::date and e.expense_date < ${next}::date
        and not exists (select 1 from deleted_records d where d.business_id=e.business_id and d.entity_type='EXPENSE' and d.entity_id=e.id)
    `),
    db.execute(sql`
      select coalesce(sum(greatest(o.agreed_total_price - coalesce(pp.paid,0),0)),0) as value
      from orders o
      left join lateral (
        select sum(p.amount) as paid from payments p
        where p.order_id=o.id and not exists (
          select 1 from deleted_records d where d.business_id=p.business_id and d.entity_type='PAYMENT' and d.entity_id=p.id
        )
      ) pp on true
      where o.business_id=${user.businessId}::uuid and o.status not in ('CANCELLED','CLOSED')
        and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)
    `)
  ]);
  const number = (result: { rows: Record<string, unknown>[] }) => Number(result.rows[0]?.value ?? 0);
  const sales = number(salesResult as never);
  const collected = number(collectedResult as never);
  const purchases = number(purchaseResult as never);
  const expenses = number(expenseResult as never);
  const receivable = number(receivableResult as never);
  return json({ month, sales, collected, purchases, expenses, receivable, netCash: collected - purchases - expenses });
}
