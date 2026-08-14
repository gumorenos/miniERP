import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { embroideryJobs, embroideryProviders, orderItems, orders, orderStatusHistory } from "../db/schema";
import type { AuthUser } from "./auth";

const updateSchema=z.object({action:z.literal("update"),providerId:z.string().uuid().optional(),expectedReturnDate:z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/),z.null()]).optional(),estimatedCost:z.coerce.number().nonnegative().optional().nullable(),actualCost:z.coerce.number().nonnegative().optional().nullable(),notes:z.string().trim().max(500).optional().nullable()});
const archiveSchema=z.object({action:z.literal("archive")});
function json(payload:unknown,status=200){return new Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json; charset=utf-8"}});}
async function archived(businessId:string,id:string){const result=await db.execute(sql`select 1 from deleted_records where business_id=${businessId}::uuid and entity_type='EMBROIDERY_JOB' and entity_id=${id}::uuid limit 1`);return result.rows.length>0;}
async function context(businessId:string,id:string){
  const [job]=await db.select().from(embroideryJobs).where(and(eq(embroideryJobs.id,id),eq(embroideryJobs.businessId,businessId))).limit(1);if(!job)return null;
  const [item]=await db.select({orderId:orderItems.orderId}).from(orderItems).where(eq(orderItems.id,job.orderItemId)).limit(1);if(!item)return null;
  const [order]=await db.select({id:orders.id,status:orders.status}).from(orders).where(and(eq(orders.id,item.orderId),eq(orders.businessId,businessId))).limit(1);if(!order)return null;
  return{job,order};
}
async function validProvider(businessId:string,id:string){const [provider]=await db.select({id:embroideryProviders.id}).from(embroideryProviders).where(and(eq(embroideryProviders.id,id),eq(embroideryProviders.businessId,businessId),eq(embroideryProviders.active,true))).limit(1);if(!provider)return false;const deleted=await db.execute(sql`select 1 from deleted_records where business_id=${businessId}::uuid and entity_type='PROVIDER' and entity_id=${id}::uuid limit 1`);return deleted.rows.length===0;}

export async function updateEmbroideryJob(request:Request,user:AuthUser,id:string){
  const parsed=updateSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return json({error:"Revisa bordador, fechas y costos"},400);
  if(await archived(user.businessId,id))return json({error:"El trabajo de bordado fue borrado"},409);
  const current=await context(user.businessId,id);if(!current)return json({error:"Trabajo de bordado no encontrado"},404);
  if(parsed.data.providerId&&!(await validProvider(user.businessId,parsed.data.providerId)))return json({error:"El bordador no pertenece al negocio o fue borrado"},400);
  if(current.job.status==="SENT"&&parsed.data.actualCost!==undefined)return json({error:"El costo real se registra al recibir el bordado"},409);
  if(current.job.status==="RECEIVED"&&(parsed.data.providerId!==undefined||parsed.data.expectedReturnDate!==undefined||parsed.data.estimatedCost!==undefined))return json({error:"Después de recibir el bordado solo se corrigen costo real y notas"},409);
  const [updated]=await db.update(embroideryJobs).set({
    ...(parsed.data.providerId!==undefined?{providerId:parsed.data.providerId}:{}),...(parsed.data.expectedReturnDate!==undefined?{expectedReturnDate:parsed.data.expectedReturnDate}:{}),
    ...(parsed.data.estimatedCost!==undefined?{estimatedCost:parsed.data.estimatedCost==null?null:String(parsed.data.estimatedCost)}:{}),...(parsed.data.actualCost!==undefined?{actualCost:parsed.data.actualCost==null?null:String(parsed.data.actualCost)}:{}),
    ...(parsed.data.notes!==undefined?{notes:parsed.data.notes||null}:{})
  }).where(eq(embroideryJobs.id,current.job.id)).returning();return json(updated);
}

export async function archiveEmbroideryJob(request:Request,user:AuthUser,id:string){
  const parsed=archiveSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return json({error:"Acción inválida"},400);
  if(await archived(user.businessId,id))return json({ok:true,alreadyArchived:true});
  const current=await context(user.businessId,id);if(!current)return json({error:"Trabajo de bordado no encontrado"},404);
  const later=["ASSEMBLY","READY_FOR_DELIVERY","DELIVERED","CLOSED"];
  if(later.includes(current.order.status))return json({error:"El pedido ya avanzó a confección o entrega; corrige el costo, pero conserva el historial de bordado"},409);
  const restoreCut=["AT_EMBROIDERER","EMBROIDERY_RECEIVED"].includes(current.order.status);
  await db.transaction(async(tx)=>{
    await tx.execute(sql`insert into deleted_records (business_id,entity_type,entity_id,snapshot) values (${user.businessId}::uuid,'EMBROIDERY_JOB',${current.job.id}::uuid,${JSON.stringify({job:current.job,order:current.order})}::jsonb) on conflict (business_id,entity_type,entity_id) do nothing`);
    await tx.update(embroideryJobs).set({status:"CANCELLED",estimatedCost:"0",actualCost:null,notes:current.job.notes?`${current.job.notes}\nAnulado por corrección`:"Anulado por corrección"}).where(eq(embroideryJobs.id,current.job.id));
    if(restoreCut){await tx.update(orders).set({status:"CUT",updatedAt:new Date()}).where(eq(orders.id,current.order.id));await tx.insert(orderStatusHistory).values({orderId:current.order.id,fromStatus:current.order.status,toStatus:"CUT",note:"Bordado anulado por corrección"});}
  });return json({ok:true,orderStatus:restoreCut?"CUT":current.order.status});
}
