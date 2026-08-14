import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { materials, productSizePrices, products, stockMovements } from "../db/schema";
import { sizes } from "../domain/types";
import type { AuthUser } from "./auth";
import { listArchivedRecords } from "./archive-query";
import { archiveRecord, isArchived } from "./record-archive";

const materialCategories = ["FABRIC", "CLOSURE", "THREAD", "PACKAGING", "OTHER"] as const;
const materialUnits = ["METER", "EACH", "SPOOL", "UNIT"] as const;
const productTypes = ["DRESS", "SKIRT", "JACKET", "PANTS", "SHORTS", "OTHER"] as const;
const nullableUuid = z.union([z.string().uuid(), z.literal(""), z.null()]).optional();

const materialSchema = z.object({ name:z.string().trim().min(2).max(120),category:z.enum(materialCategories),unit:z.enum(materialUnits),color:z.string().trim().max(80).optional().nullable(),minimumStock:z.coerce.number().nonnegative().optional().nullable(),initialQuantity:z.coerce.number().nonnegative().default(0),unitCost:z.coerce.number().nonnegative().optional().nullable() });
const stockEntrySchema = z.object({ quantity:z.coerce.number().positive(),unitCost:z.coerce.number().nonnegative().optional().nullable(),notes:z.string().trim().max(240).optional().nullable() });
const productSchema = z.object({ name:z.string().trim().min(2).max(120),type:z.enum(productTypes),baseSalePrice:z.coerce.number().positive(),leadTimeDays:z.coerce.number().int().min(0).max(365).default(25),defaultFabricMaterialId:nullableUuid,defaultFabricQtyMeters:z.coerce.number().positive().optional().nullable(),defaultClosureMaterialId:nullableUuid,defaultClosureQty:z.coerce.number().positive().optional().nullable(),defaultEmbroideryCost:z.coerce.number().nonnegative().optional().nullable(),defaultOwnLaborCost:z.coerce.number().nonnegative().optional().nullable(),defaultPackagingMaterialId:nullableUuid,defaultPackagingQty:z.coerce.number().positive().optional().nullable(),xlAdjustment:z.coerce.number().nonnegative().default(0),xxlAdjustment:z.coerce.number().nonnegative().default(0),notes:z.string().trim().max(500).optional().nullable() });

function json(payload: unknown,status=200){return new Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json; charset=utf-8"}});}
async function parseJson(request:Request){return request.json().catch(()=>null);}
async function requireBusinessMaterial(businessId:string,id:string,expectedCategory?:string){if(await isArchived(businessId,"MATERIAL",id))return null;const [material]=await db.select().from(materials).where(and(eq(materials.id,id),eq(materials.businessId,businessId))).limit(1);if(!material)return null;if(expectedCategory&&material.category!==expectedCategory)return null;return material;}
async function currentQuantity(materialId:string){const [row]=await db.select({quantity:sql<string>`coalesce(sum(${stockMovements.quantitySigned}), 0)`}).from(stockMovements).where(eq(stockMovements.materialId,materialId));return Number(row?.quantity??0);}

export function isCatalogMutation(request:Request){const pathname=new URL(request.url).pathname;if(pathname==="/api/archive"&&(request.method==="GET"||request.method==="POST"))return true;if(request.method!=="POST")return false;return pathname==="/api/products"||pathname==="/api/materials"||/^\/api\/materials\/[0-9a-f-]+\/stock$/i.test(pathname);}

export async function handleCatalogMutation(request:Request,user:AuthUser):Promise<Response>{
  const pathname=new URL(request.url).pathname;
  if(pathname==="/api/archive")return request.method==="GET"?listArchivedRecords(user):archiveRecord(request,user);

  if(pathname==="/api/materials"){
    const parsed=materialSchema.safeParse(await parseJson(request));if(!parsed.success)return json({error:"Revisa los datos del material"},400);const body=parsed.data;
    const result=await db.transaction(async(tx)=>{const [material]=await tx.insert(materials).values({businessId:user.businessId,name:body.name,category:body.category,unit:body.unit,color:body.color||null,minimumStock:body.minimumStock==null?null:String(body.minimumStock)}).returning();if(body.initialQuantity>0)await tx.insert(stockMovements).values({businessId:user.businessId,materialId:material.id,type:"INITIAL_STOCK",quantitySigned:String(body.initialQuantity),unitCost:body.unitCost==null?null:String(body.unitCost),notes:"Stock inicial"});return material;});
    return json({...result,currentQuantity:body.initialQuantity},201);
  }

  const stockMatch=pathname.match(/^\/api\/materials\/([0-9a-f-]+)\/stock$/i);
  if(stockMatch){const materialId=stockMatch[1];const material=await requireBusinessMaterial(user.businessId,materialId);if(!material)return json({error:"Material no encontrado o borrado"},404);const parsed=stockEntrySchema.safeParse(await parseJson(request));if(!parsed.success)return json({error:"Revisa cantidad y costo de la entrada"},400);await db.insert(stockMovements).values({businessId:user.businessId,materialId,type:"MANUAL_ENTRY",quantitySigned:String(parsed.data.quantity),unitCost:parsed.data.unitCost==null?null:String(parsed.data.unitCost),notes:parsed.data.notes||"Entrada manual de stock"});return json({materialId,currentQuantity:await currentQuantity(materialId)},201);}

  if(pathname==="/api/products"){
    const parsed=productSchema.safeParse(await parseJson(request));if(!parsed.success)return json({error:"Revisa los datos del producto"},400);const body=parsed.data;const fabricId=body.defaultFabricMaterialId||null;const closureId=body.defaultClosureMaterialId||null;const packagingId=body.defaultPackagingMaterialId||null;
    if(fabricId&&!(await requireBusinessMaterial(user.businessId,fabricId,"FABRIC")))return json({error:"La tela seleccionada no pertenece al negocio o fue borrada"},400);
    if(closureId&&!(await requireBusinessMaterial(user.businessId,closureId,"CLOSURE")))return json({error:"El cierre seleccionado no pertenece al negocio o fue borrado"},400);
    if(packagingId&&!(await requireBusinessMaterial(user.businessId,packagingId,"PACKAGING")))return json({error:"El empaque seleccionado no pertenece al negocio o fue borrado"},400);
    if(fabricId&&!body.defaultFabricQtyMeters)return json({error:"Indica cuánta tela usa la prenda"},400);
    const product=await db.transaction(async(tx)=>{const [created]=await tx.insert(products).values({businessId:user.businessId,name:body.name,type:body.type,baseSalePrice:String(body.baseSalePrice),leadTimeDays:body.leadTimeDays,defaultFabricMaterialId:fabricId,defaultFabricQtyMeters:body.defaultFabricQtyMeters==null?null:String(body.defaultFabricQtyMeters),defaultClosureMaterialId:closureId,defaultClosureQty:closureId&&body.defaultClosureQty!=null?String(body.defaultClosureQty):null,defaultEmbroideryCost:body.defaultEmbroideryCost==null?null:String(body.defaultEmbroideryCost),defaultOwnLaborCost:body.defaultOwnLaborCost==null?null:String(body.defaultOwnLaborCost),defaultPackagingMaterialId:packagingId,defaultPackagingQty:packagingId&&body.defaultPackagingQty!=null?String(body.defaultPackagingQty):null,notes:body.notes||null}).returning();await tx.insert(productSizePrices).values(sizes.map((size)=>({productId:created.id,size,priceAdjustment:String(size==="XL"?body.xlAdjustment:size==="XXL"?body.xxlAdjustment:0)})));return created;});
    const sizePrices=await db.select().from(productSizePrices).where(eq(productSizePrices.productId,product.id));return json({...product,sizePrices},201);
  }
  return json({error:"No encontrado"},404);
}
