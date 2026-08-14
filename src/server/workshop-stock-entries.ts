import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { materials, stockMovements } from "../db/schema";
import type { AuthUser } from "./auth";

const editableTypes = ["INITIAL_STOCK", "MANUAL_ENTRY", "PURCHASE", "MANUAL_ADJUSTMENT"] as const;
const createSchema = z.object({ action:z.literal("create"),materialId:z.string().uuid(),quantity:z.coerce.number().refine((value)=>Math.abs(value)>0.0001,"Cantidad inválida"),unitCost:z.coerce.number().nonnegative().optional().nullable(),notes:z.string().trim().min(2).max(240) });
const updateSchema = z.object({ action:z.literal("update"),id:z.string().uuid(),quantity:z.coerce.number().refine((value)=>Math.abs(value)>0.0001,"Cantidad inválida"),unitCost:z.coerce.number().nonnegative().optional().nullable(),notes:z.string().trim().min(2).max(240) });
const archiveSchema = z.object({ action:z.literal("archive"),id:z.string().uuid() });

function json(payload:unknown,status=200){return new Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json; charset=utf-8"}});}
async function archived(businessId:string,id:string){const result=await db.execute(sql`select 1 from deleted_records where business_id=${businessId}::uuid and entity_type='STOCK_MOVEMENT' and entity_id=${id}::uuid limit 1`);return result.rows.length>0;}
async function materialArchived(businessId:string,id:string){const result=await db.execute(sql`select 1 from deleted_records where business_id=${businessId}::uuid and entity_type='MATERIAL' and entity_id=${id}::uuid limit 1`);return result.rows.length>0;}
async function currentStock(materialId:string){const [row]=await db.select({qty:sql<string>`coalesce(sum(${stockMovements.quantitySigned}),0)`}).from(stockMovements).where(eq(stockMovements.materialId,materialId));return Number(row?.qty??0);}

async function editableMovement(businessId:string,id:string){
  const [row]=await db.select().from(stockMovements).where(and(eq(stockMovements.id,id),eq(stockMovements.businessId,businessId),isNull(stockMovements.purchaseLineId))).limit(1);
  if(!row||!editableTypes.includes(row.type as typeof editableTypes[number]))return null;
  return row;
}

export async function createManualStockAdjustment(request:Request,user:AuthUser){
  const parsed=createSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return json({error:"Revisa material, cantidad y motivo del ajuste"},400);
  if(await materialArchived(user.businessId,parsed.data.materialId))return json({error:"El material fue borrado"},409);
  const [material]=await db.select({id:materials.id}).from(materials).where(and(eq(materials.id,parsed.data.materialId),eq(materials.businessId,user.businessId),eq(materials.active,true))).limit(1);
  if(!material)return json({error:"Material no encontrado"},404);
  const stock=await currentStock(material.id);if(stock+parsed.data.quantity< -0.0001)return json({error:"El ajuste dejaría el inventario negativo"},409);
  const [created]=await db.insert(stockMovements).values({businessId:user.businessId,materialId:material.id,type:"MANUAL_ADJUSTMENT",quantitySigned:String(parsed.data.quantity),unitCost:parsed.data.unitCost==null?null:String(parsed.data.unitCost),notes:parsed.data.notes}).returning();
  return json({...created,currentQuantity:stock+parsed.data.quantity},201);
}

export async function listManualStockEntries(user:AuthUser){
  const rows=await db.select({id:stockMovements.id,materialId:stockMovements.materialId,type:stockMovements.type,quantitySigned:stockMovements.quantitySigned,unitCost:stockMovements.unitCost,notes:stockMovements.notes,occurredAt:stockMovements.occurredAt,materialName:materials.name}).from(stockMovements).innerJoin(materials,eq(materials.id,stockMovements.materialId)).where(and(eq(stockMovements.businessId,user.businessId),isNull(stockMovements.purchaseLineId))).orderBy(desc(stockMovements.occurredAt)).limit(100);
  const hiddenResult=await db.execute(sql`select entity_type,entity_id::text as id from deleted_records where business_id=${user.businessId}::uuid and entity_type in ('STOCK_MOVEMENT','MATERIAL')`);
  const hiddenMovements=new Set(hiddenResult.rows.filter((row)=>String(row.entity_type)==="STOCK_MOVEMENT").map((row)=>String(row.id)));
  const hiddenMaterials=new Set(hiddenResult.rows.filter((row)=>String(row.entity_type)==="MATERIAL").map((row)=>String(row.id)));
  return json({rows:rows.filter((row)=>!hiddenMovements.has(row.id)&&!hiddenMaterials.has(row.materialId)&&editableTypes.includes(row.type as typeof editableTypes[number])).map((row)=>({...row,quantitySigned:Number(row.quantitySigned),unitCost:row.unitCost==null?null:Number(row.unitCost)}))});
}

export async function editManualStockEntry(request:Request,user:AuthUser){
  const parsed=updateSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return json({error:"Revisa cantidad, costo y motivo de la entrada"},400);
  if(await archived(user.businessId,parsed.data.id))return json({error:"La entrada fue borrada"},409);
  const current=await editableMovement(user.businessId,parsed.data.id);if(!current)return json({error:"Movimiento no editable; las compras y consumos se corrigen en su módulo de origen"},409);
  if(await materialArchived(user.businessId,current.materialId))return json({error:"El material fue borrado y su historial ya no se puede modificar"},409);
  if(current.type!=="MANUAL_ADJUSTMENT"&&parsed.data.quantity<=0)return json({error:"Las entradas históricas deben conservar una cantidad positiva"},400);
  const stock=await currentStock(current.materialId);const projected=stock-Number(current.quantitySigned)+parsed.data.quantity;if(projected< -0.0001)return json({error:"La corrección dejaría el inventario negativo"},409);
  const [updated]=await db.update(stockMovements).set({quantitySigned:String(parsed.data.quantity),unitCost:parsed.data.unitCost==null?null:String(parsed.data.unitCost),notes:parsed.data.notes}).where(eq(stockMovements.id,current.id)).returning();return json({...updated,currentQuantity:projected});
}

export async function archiveManualStockEntry(request:Request,user:AuthUser){
  const parsed=archiveSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return json({error:"Entrada inválida"},400);
  if(await archived(user.businessId,parsed.data.id))return json({ok:true,alreadyArchived:true});
  const current=await editableMovement(user.businessId,parsed.data.id);if(!current)return json({error:"Movimiento no editable; las compras y consumos no se borran desde aquí"},409);
  if(await materialArchived(user.businessId,current.materialId))return json({error:"El material fue borrado y su historial ya no se puede modificar"},409);
  const stock=await currentStock(current.materialId);if(stock-Number(current.quantitySigned)< -0.0001)return json({error:"No se puede borrar este movimiento porque dejaría el inventario negativo"},409);
  await db.transaction(async(tx)=>{await tx.execute(sql`insert into deleted_records (business_id,entity_type,entity_id,snapshot) values (${user.businessId}::uuid,'STOCK_MOVEMENT',${current.id}::uuid,${JSON.stringify(current)}::jsonb) on conflict (business_id,entity_type,entity_id) do nothing`);await tx.update(stockMovements).set({quantitySigned:"0"}).where(eq(stockMovements.id,current.id));});return json({ok:true});
}
