import React, { useState } from "react";
import { api, type Bootstrap } from "./api";

const categoryLabels: Record<string, string> = { FABRIC: "Tela", CLOSURE: "Cierre", THREAD: "Hilo", PACKAGING: "Empaque", OTHER: "Otro" };
const unitLabels: Record<string, string> = { METER: "m", EACH: "unid.", SPOOL: "carrete", UNIT: "unid." };

export function InventoryManager({ data, onChanged }: { data: Bootstrap; onChanged: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("FABRIC");
  const [unit, setUnit] = useState("METER");
  const [color, setColor] = useState("");
  const [minimumStock, setMinimumStock] = useState(0);
  const [initialQuantity, setInitialQuantity] = useState(0);
  const [initialUnitCost, setInitialUnitCost] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [entryQuantity, setEntryQuantity] = useState(0);
  const [entryUnitCost, setEntryUnitCost] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const changeCategory = (next: string) => {
    setCategory(next);
    setUnit(next === "FABRIC" ? "METER" : next === "THREAD" ? "SPOOL" : "EACH");
  };

  const createMaterial = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setMessage("");
    if (name.trim().length < 2) return setError("Ingresa un nombre para el material.");
    setSaving(true);
    try {
      await api.createMaterial({ name: name.trim(), category, unit, color: color.trim() || null, minimumStock, initialQuantity, unitCost: initialQuantity > 0 ? initialUnitCost : null });
      setName(""); setColor(""); setInitialQuantity(0); setInitialUnitCost(0);
      await onChanged(); setMessage("Material creado correctamente.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el material."); }
    finally { setSaving(false); }
  };

  const addStock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setMessage("");
    if (!selectedId || entryQuantity <= 0) return setError("Selecciona un material e ingresa una cantidad mayor a cero.");
    setSaving(true);
    try {
      await api.addMaterialStock(selectedId, { quantity: entryQuantity, unitCost: entryUnitCost });
      setEntryQuantity(0); setEntryUnitCost(0);
      await onChanged(); setMessage("Entrada registrada correctamente.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar la entrada."); }
    finally { setSaving(false); }
  };

  return <div className="stack">
    <section><h2>Nuevo material</h2><form className="form" onSubmit={createMaterial}>
      <label>Material *<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tela negra" required minLength={2} /></label>
      <label>Tipo<select value={category} onChange={(e) => changeCategory(e.target.value)}>{Object.entries(categoryLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Unidad<select value={unit} onChange={(e) => setUnit(e.target.value)}><option value="METER">Metro</option><option value="EACH">Unidad</option><option value="SPOOL">Carrete</option><option value="UNIT">Otra unidad</option></select></label>
      <label>Color<input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Opcional" /></label>
      <label>Stock mínimo<input type="number" min="0" step="0.01" value={minimumStock} onChange={(e) => setMinimumStock(Number(e.target.value))} /></label>
      <label>Stock inicial<input type="number" min="0" step="0.01" value={initialQuantity} onChange={(e) => setInitialQuantity(Number(e.target.value))} /></label>
      {initialQuantity > 0 && <label>Costo por unidad<input type="number" min="0" step="0.01" value={initialUnitCost} onChange={(e) => setInitialUnitCost(Number(e.target.value))} /></label>}
      {error && <p className="error" role="alert">{error}</p>}{message && <p className="login-success" role="status">{message}</p>}
      <button type="submit" disabled={saving || name.trim().length < 2}>{saving ? "Guardando..." : "Crear material"}</button>
    </form></section>

    {!!data.materials.length && <section><h2>Registrar entrada</h2><form className="form" onSubmit={addStock}>
      <label>Material<select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}><option value="">Selecciona...</option>{data.materials.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.currentQuantity} {unitLabels[m.unit] ?? m.unit}</option>)}</select></label>
      <label>Cantidad<input type="number" min="0.01" step="0.01" value={entryQuantity} onChange={(e) => setEntryQuantity(Number(e.target.value))} /></label>
      <label>Costo por unidad<input type="number" min="0" step="0.01" value={entryUnitCost} onChange={(e) => setEntryUnitCost(Number(e.target.value))} /></label>
      <button type="submit" disabled={saving || !selectedId || entryQuantity <= 0}>{saving ? "Guardando..." : "Registrar entrada"}</button>
    </form></section>}

    <section><h2>Inventario</h2>{!data.materials.length ? <p className="muted">Todavía no hay materiales registrados.</p> : <div className="list">{data.materials.map((m) => <div className="row static" key={m.id}><span><strong>{m.name}</strong><small>{categoryLabels[m.category] ?? m.category} · {m.color ?? "sin color"}</small></span><strong>{m.currentQuantity} {unitLabels[m.unit] ?? m.unit}</strong></div>)}</div>}</section>
  </div>;
}
