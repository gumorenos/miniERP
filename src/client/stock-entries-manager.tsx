import React, { useEffect, useState } from "react";
import type { Bootstrap } from "./api";
import { operationsApi, type StockEntryRow } from "./operations-api";

const labels: Record<string,string> = { INITIAL_STOCK:"Stock inicial", MANUAL_ENTRY:"Entrada manual", PURCHASE:"Entrada manual antigua" };

export function StockEntriesManager({ data, onChanged }: { data: Bootstrap; onChanged: () => Promise<void> }) {
  const [rows,setRows]=useState<StockEntryRow[]>([]);const [editing,setEditing]=useState<StockEntryRow|null>(null);const [quantity,setQuantity]=useState(0);const [unitCost,setUnitCost]=useState(0);const [notes,setNotes]=useState("");const [error,setError]=useState("");const [message,setMessage]=useState("");
  const load=async()=>{const result=await operationsApi.stockEntries();setRows(result.rows);};
  useEffect(()=>{void load().catch((err)=>setError(err instanceof Error?err.message:"No se pudieron cargar las entradas."));},[]);
  const startEdit=(row:StockEntryRow)=>{setEditing(row);setQuantity(row.quantitySigned);setUnitCost(Number(row.unitCost??0));setNotes(row.notes??"");setError("");setMessage("");};
  const material=(id:string)=>data.materials.find((row)=>row.id===id);

  return <section><h2>Historial de entradas manuales</h2><p className="muted">Las compras formales se corrigen en Compras/Gastos; los consumos de pedidos no se editan aquí.</p>
    {editing&&<form className="form" onSubmit={async(event)=>{event.preventDefault();setError("");setMessage("");try{await operationsApi.updateStockEntry(editing.id,{quantity,unitCost,notes:notes.trim()||null});setEditing(null);await Promise.all([load(),onChanged()]);setMessage("Entrada corregida.");}catch(err){setError(err instanceof Error?err.message:"No se pudo corregir la entrada.");}}}><p><strong>{material(editing.materialId)?.name??editing.materialName}</strong> · {labels[editing.type]??editing.type}</p><label>Cantidad<input type="number" min="0.001" step="0.001" value={quantity} onChange={(e)=>setQuantity(Number(e.target.value))}/></label><label>Costo unitario<input type="number" min="0" step="0.01" value={unitCost} onChange={(e)=>setUnitCost(Number(e.target.value))}/></label><label>Notas<input value={notes} onChange={(e)=>setNotes(e.target.value)}/></label><div className="actions"><button>Guardar corrección</button><button type="button" className="secondary" onClick={()=>setEditing(null)}>Cancelar</button></div></form>}
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="login-success" role="status">{message}</p>}
    {rows.length?<div className="list">{rows.map((row)=><div className="row static" key={row.id}><span><strong>{row.materialName}</strong><small>{labels[row.type]??row.type} · {new Date(row.occurredAt).toLocaleString()} · costo {row.unitCost==null?"-":`S/ ${Number(row.unitCost).toFixed(2)}`}</small></span><span><strong>+{row.quantitySigned}</strong><button className="ghost" onClick={()=>startEdit(row)}>Editar</button><button className="ghost danger" onClick={async()=>{if(!confirm("¿Borrar esta entrada de stock?"))return;try{await operationsApi.archiveStockEntry(row.id);await Promise.all([load(),onChanged()]);}catch(err){setError(err instanceof Error?err.message:"No se pudo borrar la entrada.");}}}>Borrar</button></span></div>)}</div>:<p className="muted">Sin entradas manuales editables.</p>}
  </section>;
}
