import React, { useEffect, useState } from "react";
import type { Bootstrap } from "./api";
import { operationsApi, type FinishedStockData } from "./operations-api";

const sizes = ["S", "M", "L", "XL", "XXL"] as const;
const movementOptions = [
  ["initial", "Stock inicial"],
  ["production", "Entrada de producción"],
  ["sale", "Salida / venta"],
  ["adjust-in", "Ajuste positivo"],
  ["adjust-out", "Ajuste negativo"]
] as const;

function movementPayload(kind: string, quantity: number) {
  if (kind === "initial") return { type: "INITIAL", quantitySigned: quantity };
  if (kind === "production") return { type: "PRODUCTION_IN", quantitySigned: quantity };
  if (kind === "sale") return { type: "SALE_OUT", quantitySigned: -quantity };
  return { type: "ADJUSTMENT", quantitySigned: kind === "adjust-out" ? -quantity : quantity };
}

function kindForMovement(type: string, quantitySigned: number) {
  if (type === "INITIAL") return "initial";
  if (type === "PRODUCTION_IN") return "production";
  if (type === "SALE_OUT") return "sale";
  return quantitySigned < 0 ? "adjust-out" : "adjust-in";
}

export function FinishedStockManager({ data }: { data: Bootstrap }) {
  const [stock, setStock] = useState<FinishedStockData>({ balances: [], movements: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  const [size, setSize] = useState("M");
  const [color, setColor] = useState("");
  const [kind, setKind] = useState("production");
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => setStock(await operationsApi.finishedStock());
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el stock terminado.")); }, []);

  const reset = () => { setEditingId(null); setProductId(data.products[0]?.id ?? ""); setSize("M"); setColor(""); setKind("production"); setQuantity(1); setUnitCost(0); setNotes(""); };
  const edit = (movement: FinishedStockData["movements"][number]) => { setEditingId(movement.id); setProductId(movement.productId); setSize(movement.size); setColor(movement.color); setKind(kindForMovement(movement.type, movement.quantitySigned)); setQuantity(Math.abs(movement.quantitySigned)); setUnitCost(Number(movement.unitCost ?? 0)); setNotes(movement.notes ?? ""); setError(""); setMessage(""); };

  if (!data.products.length) return <section><h2>Stock de prendas terminadas</h2><p className="muted">Crea primero un producto para registrar prendas terminadas.</p></section>;

  return <div className="stack">
    <section><h2>{editingId ? "Editar movimiento de prenda" : "Registrar prenda terminada"}</h2><form className="form" onSubmit={async (event) => {
      event.preventDefault(); setError(""); setMessage("");
      try {
        if (!color.trim()) throw new Error("Indica el color de la prenda.");
        if (quantity <= 0) throw new Error("La cantidad debe ser mayor a cero.");
        const movement = movementPayload(kind, quantity);
        await operationsApi.saveFinishedStock(editingId
          ? { action: "update", id: editingId, ...movement, unitCost, notes: notes.trim() || null }
          : { action: "create", productId, size, color: color.trim(), ...movement, unitCost, notes: notes.trim() || null });
        const wasEditing = Boolean(editingId); reset(); await load(); setMessage(wasEditing ? "Movimiento actualizado." : "Movimiento de stock registrado.");
      } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar el movimiento."); }
    }}>
      <label>Producto<select disabled={Boolean(editingId)} value={productId} onChange={(e) => setProductId(e.target.value)}>{data.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      <div className="form-grid"><label>Talla<select disabled={Boolean(editingId)} value={size} onChange={(e) => setSize(e.target.value)}>{sizes.map((value) => <option key={value}>{value}</option>)}</select></label><label>Color<input disabled={Boolean(editingId)} value={color} onChange={(e) => setColor(e.target.value)} required /></label><label>Movimiento<select value={kind} onChange={(e) => setKind(e.target.value)}>{movementOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Cantidad<input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label></div>
      <label>Costo unitario referencial<input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} /></label><label>Notas<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}{message && <p className="login-success" role="status">{message}</p>}
      <div className="actions"><button>{editingId ? "Guardar movimiento" : "Registrar movimiento"}</button>{editingId && <button type="button" className="secondary" onClick={reset}>Cancelar</button>}</div>
    </form></section>

    <section><h2>Prendas disponibles</h2>{stock.balances.length ? <div className="list">{stock.balances.map((row) => <div className="row static" key={`${row.productId}-${row.size}-${row.color}`}><span><strong>{row.productName}</strong><small>Talla {row.size} · {row.color}</small></span><strong>{row.quantity} un.</strong></div>)}</div> : <p className="muted">No hay prendas terminadas disponibles.</p>}</section>

    <section><h2>Últimos movimientos</h2>{stock.movements.length ? <div className="list">{stock.movements.map((row) => <div className="row static" key={row.id}><span><strong>{row.size} · {row.color}</strong><small>{row.type} · {new Date(row.occurredAt).toLocaleString()}</small></span><span><strong>{row.quantitySigned > 0 ? "+" : ""}{row.quantitySigned}</strong><button className="ghost" onClick={() => edit(row)}>Editar</button><button className="ghost danger" onClick={async () => { if (!confirm("¿Borrar este movimiento?")) return; try { await operationsApi.archiveFinishedStock(row.id); await load(); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo borrar el movimiento."); } }}>Borrar</button></span></div>)}</div> : <p className="muted">Sin movimientos de prendas.</p>}</section>
  </div>;
}
