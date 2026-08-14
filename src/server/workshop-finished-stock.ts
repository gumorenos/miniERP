import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { finishedStockMovements } from "../db/finished-stock-schema";
import { products } from "../db/schema";
import { projectedStock, validateFinishedStockDirection } from "../domain/stock";
import { sizes } from "../domain/types";
import type { AuthUser } from "./auth";
import { isArchived } from "./record-archive";

const movementTypes = ["INITIAL", "PRODUCTION_IN", "SALE_OUT", "ADJUSTMENT"] as const;
const createSchema = z.object({
  action: z.literal("create").optional(), productId: z.string().uuid(), size: z.enum(sizes), color: z.string().trim().min(1).max(120),
  type: z.enum(movementTypes), quantitySigned: z.coerce.number().int().refine((value) => value !== 0), unitCost: z.coerce.number().nonnegative().optional().nullable(), notes: z.string().trim().max(500).optional().nullable()
});
const updateSchema = z.object({
  action: z.literal("update"), id: z.string().uuid(), type: z.enum(movementTypes), quantitySigned: z.coerce.number().int().refine((value) => value !== 0),
  unitCost: z.coerce.number().nonnegative().optional().nullable(), notes: z.string().trim().max(500).optional().nullable()
});
const archiveSchema = z.object({ action: z.literal("archive"), id: z.string().uuid() });

function json(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }
async function movementArchived(businessId: string, id: string) { const result = await db.execute(sql`select 1 from deleted_records where business_id=${businessId}::uuid and entity_type='FINISHED_STOCK_MOVEMENT' and entity_id=${id}::uuid limit 1`); return result.rows.length > 0; }
async function balanceFor(businessId: string, productId: string, size: string, color: string) { const result = await db.execute(sql`select coalesce(sum(fsm.quantity_signed),0) as qty from finished_stock_movements fsm where fsm.business_id=${businessId}::uuid and fsm.product_id=${productId}::uuid and fsm.size=${size} and fsm.color=${color} and not exists (select 1 from deleted_records d where d.business_id=fsm.business_id and d.entity_type='FINISHED_STOCK_MOVEMENT' and d.entity_id=fsm.id)`); return Number(result.rows[0]?.qty ?? 0); }

export async function listFinishedStock(user: AuthUser) {
  const [balances, movementRows] = await Promise.all([
    db.execute(sql`select fsm.product_id,p.name as product_name,fsm.size,fsm.color,sum(fsm.quantity_signed)::int as quantity from finished_stock_movements fsm join products p on p.id=fsm.product_id where fsm.business_id=${user.businessId}::uuid and not exists (select 1 from deleted_records d where d.business_id=fsm.business_id and d.entity_type='FINISHED_STOCK_MOVEMENT' and d.entity_id=fsm.id) group by fsm.product_id,p.name,fsm.size,fsm.color having sum(fsm.quantity_signed) <> 0 order by p.name,fsm.size,fsm.color`),
    db.select().from(finishedStockMovements).where(eq(finishedStockMovements.businessId,user.businessId)).orderBy(desc(finishedStockMovements.occurredAt)).limit(100)
  ]);
  const archived = await db.execute(sql`select entity_id::text as id from deleted_records where business_id=${user.businessId}::uuid and entity_type='FINISHED_STOCK_MOVEMENT'`);
  const hidden = new Set(archived.rows.map((row) => String(row.id)));
  return json({ balances: balances.rows.map((row) => ({ productId:String(row.product_id),productName:String(row.product_name),size:String(row.size),color:String(row.color),quantity:Number(row.quantity) })), movements: movementRows.filter((row) => !hidden.has(row.id)).map((row) => ({ ...row,unitCost:row.unitCost==null?null:Number(row.unitCost) })) });
}

export async function saveFinishedStock(request: Request, user: AuthUser) {
  const raw = await request.json().catch(() => null) as { action?: string } | null;
  if (raw?.action === "archive") return archiveFinishedStock(request,user,raw);
  if (raw?.action === "update") {
    const parsed=updateSchema.safeParse(raw);if(!parsed.success)return json({error:"Revisa tipo, cantidad y costo del movimiento"},400);
    const directionError=validateFinishedStockDirection(parsed.data.type,parsed.data.quantitySigned);if(directionError)return json({error:directionError},400);
    if(await movementArchived(user.businessId,parsed.data.id))return json({error:"El movimiento fue borrado"},409);
    const [current]=await db.select().from(finishedStockMovements).where(and(eq(finishedStockMovements.id,parsed.data.id),eq(finishedStockMovements.businessId,user.businessId))).limit(1);if(!current)return json({error:"Movimiento no encontrado"},404);
    const balance=await balanceFor(user.businessId,current.productId,current.size,current.color);const projected=projectedStock(balance,current.quantitySigned,parsed.data.quantitySigned);if(projected<0)return json({error:"La corrección dejaría stock terminado negativo"},409);
    const [updated]=await db.update(finishedStockMovements).set({type:parsed.data.type,quantitySigned:parsed.data.quantitySigned,unitCost:parsed.data.unitCost==null?null:String(parsed.data.unitCost),notes:parsed.data.notes||null}).where(eq(finishedStockMovements.id,current.id)).returning();return json(updated);
  }

  const parsed=createSchema.safeParse(raw);if(!parsed.success)return json({error:"Revisa producto, talla, color y cantidad"},400);
  const directionError=validateFinishedStockDirection(parsed.data.type,parsed.data.quantitySigned);if(directionError)return json({error:directionError},400);
  if(await isArchived(user.businessId,"PRODUCT",parsed.data.productId))return json({error:"El producto fue borrado"},409);
  const [product]=await db.select({id:products.id}).from(products).where(and(eq(products.id,parsed.data.productId),eq(products.businessId,user.businessId))).limit(1);if(!product)return json({error:"Producto no encontrado"},404);
  const balance=await balanceFor(user.businessId,parsed.data.productId,parsed.data.size,parsed.data.color);if(balance+parsed.data.quantitySigned<0)return json({error:`Stock insuficiente. Disponible: ${balance}`},409);
  const [created]=await db.insert(finishedStockMovements).values({businessId:user.businessId,productId:parsed.data.productId,size:parsed.data.size,color:parsed.data.color,type:parsed.data.type,quantitySigned:parsed.data.quantitySigned,unitCost:parsed.data.unitCost==null?null:String(parsed.data.unitCost),notes:parsed.data.notes||null}).returning();return json(created,201);
}

async function archiveFinishedStock(request: Request,user:AuthUser,raw?:unknown){
  const parsed=archiveSchema.safeParse(raw??await request.json().catch(()=>null));if(!parsed.success)return json({error:"Movimiento inválido"},400);if(await movementArchived(user.businessId,parsed.data.id))return json({ok:true,alreadyArchived:true});
  const [current]=await db.select().from(finishedStockMovements).where(and(eq(finishedStockMovements.id,parsed.data.id),eq(finishedStockMovements.businessId,user.businessId))).limit(1);if(!current)return json({error:"Movimiento no encontrado"},404);
  const balance=await balanceFor(user.businessId,current.productId,current.size,current.color);if(balance-current.quantitySigned<0)return json({error:"No se puede borrar este movimiento porque el stock terminado quedaría negativo"},409);
  await db.execute(sql`insert into deleted_records (business_id,entity_type,entity_id,snapshot) values (${user.businessId}::uuid,'FINISHED_STOCK_MOVEMENT',${current.id}::uuid,${JSON.stringify(current)}::jsonb) on conflict (business_id,entity_type,entity_id) do nothing`);return json({ok:true});
}
