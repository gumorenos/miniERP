import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { AuthUser } from "./auth";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function workshopAgenda(user: AuthUser) {
  const [ordersResult, embroideryResult] = await Promise.all([
    db.execute(sql`
      select o.id, o.order_number, o.status, o.promised_delivery_date, c.name as customer_name, c.phone,
             o.agreed_total_price,
             greatest(o.agreed_total_price - coalesce(pp.paid,0),0) as balance
      from orders o
      join customers c on c.id=o.customer_id
      left join lateral (
        select sum(p.amount) as paid from payments p
        where p.order_id=o.id and not exists (
          select 1 from deleted_records d where d.business_id=p.business_id and d.entity_type='PAYMENT' and d.entity_id=p.id
        )
      ) pp on true
      where o.business_id=${user.businessId}::uuid
        and o.status not in ('CANCELLED','CLOSED')
        and o.promised_delivery_date is not null
        and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)
      order by o.promised_delivery_date asc, o.order_number asc
    `),
    db.execute(sql`
      select ej.id, ej.status, ej.expected_return_date, ej.sent_at,
             o.id as order_id, o.order_number, c.name as customer_name,
             ep.name as provider_name, ep.phone as provider_phone
      from embroidery_jobs ej
      join order_items oi on oi.id=ej.order_item_id
      join orders o on o.id=oi.order_id
      join customers c on c.id=o.customer_id
      join embroidery_providers ep on ep.id=ej.provider_id
      where ej.business_id=${user.businessId}::uuid and ej.status='SENT'
        and o.status <> 'CANCELLED'
        and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)
      order by ej.expected_return_date asc nulls last, ej.sent_at asc
    `)
  ]);

  return json({
    orders: ordersResult.rows.map((row) => ({
      id: String(row.id), orderNumber: String(row.order_number), status: String(row.status), promisedDeliveryDate: String(row.promised_delivery_date),
      customerName: String(row.customer_name), phone: row.phone == null ? null : String(row.phone), agreedTotalPrice: Number(row.agreed_total_price), balance: Number(row.balance)
    })),
    embroidery: embroideryResult.rows.map((row) => ({
      id: String(row.id), status: String(row.status), expectedReturnDate: row.expected_return_date == null ? null : String(row.expected_return_date),
      sentAt: row.sent_at == null ? null : String(row.sent_at), orderId: String(row.order_id), orderNumber: String(row.order_number),
      customerName: String(row.customer_name), providerName: String(row.provider_name), providerPhone: row.provider_phone == null ? null : String(row.provider_phone)
    }))
  });
}
