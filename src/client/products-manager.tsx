import React, { useState } from "react";
import { api, type Bootstrap } from "./api";

const typeLabels: Record<string, string> = { DRESS: "Vestido", SKIRT: "Falda / pollera", JACKET: "Casaca", PANTS: "Pantalón", SHORTS: "Short", OTHER: "Otro" };
const fmt = (value: string | number | null | undefined) => `S/ ${Number(value ?? 0).toFixed(2)}`;

export function ProductsManager({ data, onChanged }: { data: Bootstrap; onChanged: () => Promise<void> }) {
  const fabrics = data.materials.filter((item) => item.category === "FABRIC");
  const closures = data.materials.filter((item) => item.category === "CLOSURE");
  const packaging = data.materials.filter((item) => item.category === "PACKAGING");
  const [name, setName] = useState("");
  const [type, setType] = useState("DRESS");
  const [price, setPrice] = useState(320);
  const [fabricId, setFabricId] = useState("");
  const [fabricQty, setFabricQty] = useState(1);
  const [closureId, setClosureId] = useState("");
  const [packagingId, setPackagingId] = useState("");
  const [embroideryCost, setEmbroideryCost] = useState(80);
  const [laborCost, setLaborCost] = useState(15);
  const [xlAdjustment, setXlAdjustment] = useState(0);
  const [xxlAdjustment, setXxlAdjustment] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(""); setSuccess("");
    if (name.trim().length < 2) return setError("Ingresa un nombre para el producto.");
    if (price <= 0) return setError("El precio debe ser mayor a cero.");
    setSaving(true);
    try {
      await api.createProduct({
        name: name.trim(), type, baseSalePrice: price,
        defaultFabricMaterialId: fabricId || null,
        defaultFabricQtyMeters: fabricId ? fabricQty : null,
        defaultClosureMaterialId: closureId || null,
        defaultClosureQty: closureId ? 1 : null,
        defaultPackagingMaterialId: packagingId || null,
        defaultPackagingQty: packagingId ? 1 : null,
        defaultEmbroideryCost: embroideryCost,
        defaultOwnLaborCost: laborCost,
        xlAdjustment, xxlAdjustment,
        notes: notes.trim() || null
      });
      setName(""); setNotes("");
      await onChanged();
      setSuccess("Producto creado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el producto.");
    } finally { setSaving(false); }
  };

  return <div className="stack">
    <section>
      <h2>Nuevo producto</h2>
      {!fabrics.length && <p className="warning">Aún no hay telas en Inventario. Puedes crear el modelo, pero necesitarás asignar tela para usar el corte.</p>}
      <form className="form" onSubmit={submit}>
        <label>Nombre del modelo *<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Vestido Mariana" required minLength={2} /></label>
        <label>Tipo<select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Precio base *<input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} /></label>
        <label>Tela habitual<select value={fabricId} onChange={(e) => setFabricId(e.target.value)}><option value="">Sin definir</option>{fabrics.map((m) => <option key={m.id} value={m.id}>{m.name}{m.color ? ` · ${m.color}` : ""}</option>)}</select></label>
        {fabricId && <label>Metros por prenda<input type="number" min="0.01" step="0.01" value={fabricQty} onChange={(e) => setFabricQty(Number(e.target.value))} /></label>}
        <label>Cierre<select value={closureId} onChange={(e) => setClosureId(e.target.value)}><option value="">No usa / sin definir</option>{closures.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label>Empaque<select value={packagingId} onChange={(e) => setPackagingId(e.target.value)}><option value="">Sin definir</option>{packaging.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label>Costo estimado de bordado<input type="number" min="0" step="0.01" value={embroideryCost} onChange={(e) => setEmbroideryCost(Number(e.target.value))} /></label>
        <label>Mano de obra propia<input type="number" min="0" step="0.01" value={laborCost} onChange={(e) => setLaborCost(Number(e.target.value))} /></label>
        <label>Recargo XL<input type="number" min="0" step="0.01" value={xlAdjustment} onChange={(e) => setXlAdjustment(Number(e.target.value))} /></label>
        <label>Recargo XXL<input type="number" min="0" step="0.01" value={xxlAdjustment} onChange={(e) => setXxlAdjustment(Number(e.target.value))} /></label>
        <label>Notas<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalles del modelo" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        {success && <p className="login-success" role="status">{success}</p>}
        <button type="submit" disabled={saving || name.trim().length < 2}>{saving ? "Guardando..." : "Crear producto"}</button>
      </form>
    </section>
    <section><h2>Productos</h2>{!data.products.length ? <p className="muted">Todavía no hay productos registrados.</p> : <div className="list">{data.products.map((p) => <div className="row static" key={p.id}><span><strong>{p.name}</strong><small>{typeLabels[p.type] ?? p.type} · tela {p.defaultFabricQtyMeters ?? "-"} m · bordado {fmt(p.defaultEmbroideryCost)}</small></span><strong>{fmt(p.baseSalePrice)}</strong></div>)}</div>}</section>
  </div>;
}
