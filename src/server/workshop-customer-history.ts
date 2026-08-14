import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { customers } from "../db/schema";
import { calculateCustomerMetrics } from "../domain/workshop";
import type { AuthUser } from "./auth";
import { isArchived } from "./record-archive";

function json(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }

export async function customerHistory(user: AuthUser, customerId: string) {
  if (await isArchived(user.businessId,"CUSTOMER",customerId)) return json({error:"El cliente fue borrado"},409);
  const [customer]=await db.select().from(customers).where(and(eq(customers.id,customerId),eq(customers.businessId,user.businessId))).limit(1);
  if(!customer)return json({error:"Cliente no encontrado"},404);
  const result=await db.execute(sql`
    select o.id,o.order_number,o.status,o.order_date,o.promised_delivery_date,o.agreed_total_price,
           coalesce(sum(p.amount) filter (where not exists (
             select 1 from deleted_records dp where dp.business_id=p.business_id and dp.entity_type='PAYMENT' and dp.entity_id=p.id
           )),0) as total_paid
    from orders o left join payments p on p.order_id=o.id
    where o.business_id=${user.businessId}::uuid and o.customer_id=${customer.id}::uuid
      and not exists (select 1 from deleted_records d where d.business_id=o.business_id and d.entity_type='ORDER' and d.entity_id=o.id)
    group by o.id order by o.order_date desc,o.created_at desc
  `);
  const rows=result.rows.map((row)=>({
    id:String(row.id),orderNumber:String(row.order_number),customerName:customer.name,status:String(row.status),orderDate:String(row.order_date),promisedDeliveryDate:row.promised_delivery_date==null?null:String(row.promised_delivery_date),agreedTotalPrice:String(row.agreed_total_price),totalPaid:Number(row.total_paid),balance:Math.max(0,Number(row.agreed_total_price)-Number(row.total_paid))
  }));
  const metrics=calculateCustomerMetrics(rows.map((row)=>({status:row.status,orderDate:row.orderDate,agreedTotalPrice:Number(row.agreedTotalPrice),totalPaid:row.totalPaid})));
  return json({customer:{id:customer.id,name:customer.name,phone:customer.phone,instagramHandle:customer.instagramHandle,notes:customer.notes},metrics,orders:rows});
}
