import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { limaBusinessDate } from "../domain/workshop";
import type { AuthUser } from "./auth";

function json(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }
function monthBounds() {
  const today = limaBusinessDate(); const month = today.slice(0,7); const [year,monthNumber] = month.split("-").map(Number);
  const next = monthNumber === 12 ? `${year+1}-01-01` : `${year}-${String(monthNumber+1).padStart(2,"0")}-01`;
  return { today, start:`${month}-01`, next };
}

export async function operationalDashboard(user: AuthUser) {
  const { today, start, next } = monthBounds();
  const dueEndDate = new Date(`${today}T12:00:00-05:00`); dueEndDate.setDate(dueEndDate.getDate()+7);
  const dueEnd = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Lima",year:"numeric",month:"2-digit",day:"2-digit"}).format(dueEndDate);
  const [summary, urgent, jobs] = await Promise.all([
    db.execute(sql`
      with active_orders as (
        select o.* from orders o
        where o.business_id=${user.businessId}::uuid and o.status not in ('DELIVERED','CLOSED','CANCELLED')
          and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)
      ),
      payment_by_order as (
        select p.order_id,sum(p.amount) as paid from payments p
        where p.business_id=${user.businessId}::uuid
          and not exists (select 1 from deleted_records d where d.business_id=p.business_id and d.entity_type='PAYMENT' and d.entity_id=p.id)
        group by p.order_id
      ),
      embroidery_by_item as (
        select ej.order_item_id,
          case when bool_or(ej.actual_cost is not null) then sum(coalesce(ej.actual_cost,0)) else sum(coalesce(ej.estimated_cost,0)) end as cost
        from embroidery_jobs ej
        where ej.business_id=${user.businessId}::uuid and ej.status <> 'CANCELLED'
          and not exists (select 1 from deleted_records d where d.business_id=ej.business_id and d.entity_type='EMBROIDERY_JOB' and d.entity_id=ej.id)
        group by ej.order_item_id
      ),
      cost_by_order as (
        select oi.order_id,sum(
          coalesce(oi.actual_material_cost,oi.estimated_material_cost,0)+
          coalesce(oi.actual_own_labor_cost,oi.estimated_own_labor_cost,0)+
          coalesce(oi.actual_packaging_cost,oi.estimated_packaging_cost,0)+
          coalesce(oi.other_actual_direct_cost,oi.other_estimated_direct_cost,0)+
          coalesce(ebi.cost,0)
        ) as cost
        from order_items oi left join embroidery_by_item ebi on ebi.order_item_id=oi.id group by oi.order_id
      )
      select
        (select count(*)::int from active_orders) as active_orders,
        (select count(*)::int from active_orders where status='READY_FOR_DELIVERY') as ready_for_delivery,
        (select coalesce(sum(greatest(ao.agreed_total_price-coalesce(pbo.paid,0),0)),0) from active_orders ao left join payment_by_order pbo on pbo.order_id=ao.id) as receivable,
        (select coalesce(sum(o.agreed_total_price),0) from orders o where o.business_id=${user.businessId}::uuid and o.order_date>=${start}::date and o.order_date<${next}::date and o.status<>'CANCELLED' and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)) as sales,
        (select coalesce(sum(p.amount),0) from payments p join orders o on o.id=p.order_id where p.business_id=${user.businessId}::uuid and (p.paid_at at time zone 'America/Lima')::date>=${start}::date and (p.paid_at at time zone 'America/Lima')::date<${next}::date and not exists (select 1 from deleted_records d where d.business_id=p.business_id and d.entity_type='PAYMENT' and d.entity_id=p.id) and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)) as collected,
        (select coalesce(sum(o.agreed_total_price-coalesce(cbo.cost,0)),0) from orders o left join cost_by_order cbo on cbo.order_id=o.id where o.business_id=${user.businessId}::uuid and o.order_date>=${start}::date and o.order_date<${next}::date and o.status<>'CANCELLED' and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)) as margin
    `),
    db.execute(sql`
      select o.id,o.order_number,o.status,o.promised_delivery_date,o.agreed_total_price,c.name as customer_name
      from orders o join customers c on c.id=o.customer_id
      where o.business_id=${user.businessId}::uuid and o.status not in ('DELIVERED','CLOSED','CANCELLED') and o.promised_delivery_date is not null
        and o.promised_delivery_date<=${dueEnd}::date
        and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)
      order by o.promised_delivery_date asc limit 20
    `),
    db.execute(sql`
      select ej.id,ej.expected_return_date
      from embroidery_jobs ej join order_items oi on oi.id=ej.order_item_id join orders o on o.id=oi.order_id
      where ej.business_id=${user.businessId}::uuid and ej.status='SENT' and o.status<>'CANCELLED'
        and not exists (select 1 from deleted_records d where d.business_id=ej.business_id and d.entity_type='EMBROIDERY_JOB' and d.entity_id=ej.id)
        and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)
    `)
  ]);
  const row = summary.rows[0] ?? {};
  const urgentRows = urgent.rows.map((item) => ({ id:String(item.id),orderNumber:String(item.order_number),status:String(item.status),promisedDeliveryDate:String(item.promised_delivery_date),agreedTotalPrice:String(item.agreed_total_price),customerName:String(item.customer_name) }));
  const lateOrders = urgentRows.filter((item) => item.promisedDeliveryDate < today);
  const dueSoon = urgentRows.filter((item) => item.promisedDeliveryDate >= today);
  const lateEmbroideryJobs = jobs.rows.map((item) => ({ id:String(item.id),expectedReturnDate:item.expected_return_date==null?null:String(item.expected_return_date) })).filter((item) => item.expectedReturnDate && item.expectedReturnDate < today).map((item) => ({ ...item,overdueDays:Math.max(1,Math.ceil((Date.parse(`${today}T12:00:00Z`)-Date.parse(`${item.expectedReturnDate}T12:00:00Z`))/86_400_000)) }));
  return json({
    month:start.slice(0,7), activeOrders:Number(row.active_orders??0), readyForDelivery:Number(row.ready_for_delivery??0), atEmbroidery:jobs.rows.length,
    lateOrders,dueSoon,lateEmbroideryJobs,
    money:{ sales:Number(row.sales??0),collected:Number(row.collected??0),receivable:Number(row.receivable??0),margin:Number(row.margin??0) }
  });
}
