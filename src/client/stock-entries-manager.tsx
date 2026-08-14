import React, { useEffect, useState } from "react";
import type { Bootstrap } from "./api";
import { operationsApi, type StockEntryRow } from "./operations-api";

const labels: Record<string,string> = { INITIAL_STOCK:"Stock inicial", MANUAL_ENTRY:"Entrada manual", PURCHASE:"Entrada manual antigua", MANUAL_ADJUSTMENT:"Ajuste físico" };
const signed=(value:number)=>value>0?`+${value}`:String(value);

export function StockEntriesManager({ data, onChanged }: { data: Bootstrap; onChanged: () => Promise<void> }) {
  const [rows,setRows]=useState<StockEntryRow[]>([]);const [editing,setEditing]=useState<StockEntryRow|null>(null);const [quantity,setQuantity]=useState(0);const [unitCost,setUnitCost]=useState(0);const [notes,setNotes]=useState("");const [error,setError]=useState("");const [message,setMessage]=useState("");
  const [adjustMaterialId,setAdjustMaterialId]=useState("");const [adjustQuantity,setAdjustQuantity]=useState(0);const [adjustUnitCost,setAdjustUnitCost]=useState(0);const [adjustReason,setAdjustReason]=useState("");
  const load=async()=>{const result=await operationsApi.stockEntries();setRows(result.rows);};
  useEffect(()=>{void load().catch((err)=>setError(err instanceof Error?err.message:"No se pudieron cargar las entradas."));},[]);
  const startEdit=(row:StockEntryRow)=>{setEditing(row);setQuantity(row.quantitySigned);setUnitCost(Number(row.unitCost??0));setNotes(row.notes??"");setError("");setMessage("");};
  const material=(id:string)=>data.materials.find((row)=>row.id===id);

  return <section><h2>Ajustes e historial de inventario</h2><p className="muted">Usa ajustes para conteos físicos, mermas, pérdidas o correcciones. Las compras formales se corrigen en Compras/Gastos y los consumos de pedidos no se editan aquí.</p>
    {!!data.materials.length&&<form className="form" onSubmit={async(event)=>{event.preventDefault();setError("");setMessage("");if(!adjustMaterialId||Math.abs(adjustQuantity)<0.0001)return setError("Selecciona un material e ingresa un ajuste distinto de cero.");if(adjustReason.trim().length<2)return setError("Indica el motivo del ajuste.");try{await operationsApi.createStockAdjustment({materialId:adjustMaterialId,quantity:adjustQuantity,unitCost:adjustUnitCost||null,notes:adjustReason.trim()});setAdjustQuantity(0);setAdjustUnitCost(0);setAdjustReason("");await Promise.all([load(),onChanged()]);setMessage("Ajuste de inventario registrado.");}catch(err){setError(err instanceof Error?err.message:"No se pudo registrar el ajuste.");}}}>
      <h3>Nuevo ajuste físico</h3>
      <label>Material<select name="adjust-material" value={adjustMaterialId} onChange={(e)=>setAdjustMaterialId(e.target.value)} required><option value="">Selecciona...</option>{data.materials.map((row)=><option key={row.id} value={row.id}>{row.name} · stock {row.currentQuantity}</option>)}</select></label>
      <label>Cantidad (+ entrada / − salida)<input name="adjust-quantity" type="number" step="0.001" value={adjustQuantity} onChange={(e)=>setAdjustQuantity(Number(e.target.value))} required/></label>
      <label>Costo unitario opcional<input name="adjust-unit-cost" type="number" min="0" step="0.01" value={adjustUnitCost} onChange={(e)=>setAdjustUnitCost(Number(e.target.value))}/></label>
      <label>Motivo *<input name="adjust-reason" value={adjustReason} minLength={2} onChange={(e)=>setAdjustReason(e.target.value)} placeholder="Conteo físico, merma, pérdida..." required/></label>
      <button>Registrar ajuste</button>
    </form>}
    {editing&&<form className="form" onSubmit={async(event)=>{event.preventDefault();setError("");setMessage("");if(notes.trim().length<2)return setError("Indica el motivo de la corrección.");try{await operationsApi.updateStockEntry(editing.id,{quantity,unitCost,notes:notes.trim()});setEditing(null);await Promise.all([load(),onChanged()]);setMessage("Movimiento corregido.");}catch(err){setError(err instanceof Error?err.message:"No se pudo corregir la entrada.");}}}><p><strong>{material(editing.materialId)?.name??editing.materialName}</strong> · {labels[editing.type]??editing.type}</p><label>Cantidad<input name="stock-entry-quantity" type="number" step="0.001" value={quantity} onChange={(e)=>setQuantity(Number(e.target.value))} required/></label><label>Costo unitario<input name="stock-entry-unit-cost" type="number" min="0" step="0.01" value={unitCost} onChange={(e)=>setUnitCost(Number(e.target.value))}/></label><label>Motivo / notas<input name="stock-entry-notes" value={notes} minLength={2} onChange={(e)=>setNotes(e.target.value)} required/></label><div className="actions"><button>Guardar corrección</button><button type="button" className="secondary" onClick={()=>setEditing(null)}>Cancelar</button></div></form>}
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="login-success" role="status">{message}</p>}
    {rows.length?<div className="list">{rows.map((row)=><div className="row static" key={row.id}><span><strong>{row.materialName}</strong><small>{labels[row.type]??row.type} · {new Date(row.occurredAt).toLocaleString()} · costo {row.unitCost==null?"-":`S/ ${Number(row.unitCost).toFixed(2)}`}{row.notes?` · ${row.notes}`:""}</small></span><span><strong>{signed(row.quantitySigned)}</strong><button className="ghost" type="button" onClick={()=>startEdit(row)}>Editar</button><button className="ghost danger" type="button" onClick={async()=>{if(!confirm("¿Borrar este movimiento de stock?"))return;try{await operationsApi.archiveStockEntry(row.id);await Promise.all([load(),onChanged()]);}catch(err){setError(err instanceof Error?err.message:"No se pudo borrar el movimiento.");}}}>Borrar</button></span></div>)}</div>:<p className="muted">Sin movimientos manuales editables.</p>}
  </section>;
}
