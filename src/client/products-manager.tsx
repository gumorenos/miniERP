import React, { useState } from "react";
import { api, type Bootstrap, type Product } from "./api";
import { ArchiveButton } from "./archive-button";

const typeLabels: Record<string, string> = { DRESS: "Vestido", SKIRT: "Falda / pollera", JACKET: "Casaca", PANTS: "Pantalón", SHORTS: "Short", OTHER: "Otro" };
const fmt = (value: string | number | null | undefined) => `S/ ${Number(value ?? 0).toFixed(2)}`;

export function ProductsManager({ data, onChanged }: { data: Bootstrap; onChanged: () => Promise<void> }) {
  const fabrics = data.materials.filter((item) => item.category === "FABRIC");
  const closures = data.materials.filter((item) => item.category === "CLOSURE");
  const packaging = data.materials.filter((item) => item.category === "PACKAGING");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("DRESS");
  const [price, setPrice] = useState(320);
  const [leadTimeDays, setLeadTimeDays] = useState(25);
  const [fabricId, setFabricId] = useState("");
  const [fabricQty, setFabricQty] = useState(1);
  const [closureId, setClosureId] = useState("");
  const [closureQty, setClosureQty] = useState(1);
  const [packagingId, setPackagingId] = useState("");
  const [packagingQty, setPackagingQty] = useState(1);
  const [embroideryCost, setEmbroideryCost] = useState(80);
  const [laborCost, setLaborCost] = useState(15);
  const [xlAdjustment, setXlAdjustment] = useState(0);
  const [xxlAdjustment, setXxlAdjustment] = useState(0);
  const [notes, setNotes] = useState("");
  const [details, setDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const reset = () => {
    setEditingId(null); setName(""); setType("DRESS"); setPrice(320); setLeadTimeDays(25);
    setFabricId(""); setFabricQty(1); setClosureId(""); setClosureQty(1); setPackagingId(""); setPackagingQty(1);
    setEmbroideryCost(80); setLaborCost(15); setXlAdjustment(0); setXxlAdjustment(0); setNotes(""); setDetails(false);
  };

  const edit = (product: Product) => {
    setEditingId(product.id); setName(product.name); setType(product.type); setPrice(Number(product.baseSalePrice));
    setLeadTimeDays(Number(product.leadTimeDays ?? 25)); setFabricId(product.defaultFabricMaterialId ?? "");
    setFabricQty(Number(product.defaultFabricQtyMeters ?? 1)); setClosureId(product.defaultClosureMaterialId ?? "");
    setClosureQty(Number(product.defaultClosureQty ?? 1)); setPackagingId(product.defaultPackagingMaterialId ?? "");
    setPackagingQty(Number(product.defaultPackagingQty ?? 1)); setEmbroideryCost(Number(product.defaultEmbroideryCost ?? 0));
    setLaborCost(Number(product.defaultOwnLaborCost ?? 0)); setXlAdjustment(Number(product.sizePrices.find((row) => row.size === "XL")?.priceAdjustment ?? 0));
    setXxlAdjustment(Number(product.sizePrices.find((row) => row.size === "XXL")?.priceAdjustment ?? 0)); setNotes(product.notes ?? "");
    setDetails(true); setError(""); setSuccess("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setSuccess("");
    if (name.trim().length < 2) return setError("Ingresa un nombre para el producto.");
    if (price <= 0) return setError("El precio debe ser mayor a cero.");
    if (leadTimeDays < 0 || leadTimeDays > 365) return setError("El plazo debe estar entre 0 y 365 días.");
    if (fabricId && fabricQty <= 0) return setError("El consumo de tela debe ser mayor a cero.");
    if (closureId && closureQty <= 0) return setError("La cantidad de cierres debe ser mayor a cero.");
    if (packagingId && packagingQty <= 0) return setError("La cantidad de empaques debe ser mayor a cero.");
    setSaving(true);
    try {
      await api.createProduct({ ...(editingId ? { action: "update", id: editingId } : {}), name: name.trim(), type, baseSalePrice: price, leadTimeDays,
        defaultFabricMaterialId: fabricId || null, defaultFabricQtyMeters: fabricId ? fabricQty : null, defaultClosureMaterialId: closureId || null,
        defaultClosureQty: closureId ? closureQty : null, defaultPackagingMaterialId: packagingId || null, defaultPackagingQty: packagingId ? packagingQty : null,
        defaultEmbroideryCost: embroideryCost, defaultOwnLaborCost: laborCost, xlAdjustment, xxlAdjustment, notes: notes.trim() || null });
      const wasEditing = Boolean(editingId); reset(); await onChanged(); setSuccess(wasEditing ? "Producto actualizado correctamente." : "Producto creado correctamente.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar el producto."); } finally { setSaving(false); }
  };

  return <div className="stack"><section><h2>{editingId ? "Editar producto" : "Nuevo producto"}</h2>{!fabrics.length && <p className="warning">Aún no hay telas en Inventario. Puedes crear el modelo, pero necesitarás asignar tela para usar el corte.</p>}<form className="form" onSubmit={submit}>
    <div className="form-grid"><label>Nombre del modelo *<input autoFocus value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Ej. Vestido Margarita" /></label><label>Precio base *<input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} /></label></div>
    <button className="disclosure" type="button" aria-expanded={details} onClick={() => setDetails((current) => !current)}>{details ? "Ocultar detalles" : "Más detalles"} <span>{details ? "▴" : "▾"}</span></button>
    {details && <div className="details-panel"><div className="form-grid"><label>Tipo<select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Plazo habitual (días)<input type="number" min="0" max="365" step="1" value={leadTimeDays} onChange={(e) => setLeadTimeDays(Number(e.target.value))} /></label></div>
      <div className="form-grid"><label>Tela habitual<select value={fabricId} onChange={(e) => setFabricId(e.target.value)}><option value="">Sin definir</option>{fabrics.map((m) => <option key={m.id} value={m.id}>{m.name}{m.color ? ` · ${m.color}` : ""}</option>)}</select></label>{fabricId && <label>Metros por prenda<input type="number" min="0.01" step="0.01" value={fabricQty} onChange={(e) => setFabricQty(Number(e.target.value))} /></label>}<label>Cierre<select value={closureId} onChange={(e) => setClosureId(e.target.value)}><option value="">No usa</option>{closures.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>{closureId && <label>Cant. cierres<input type="number" min="0.001" step="0.001" value={closureQty} onChange={(e) => setClosureQty(Number(e.target.value))} /></label>}</div>
      <div className="form-grid"><label>Empaque<select value={packagingId} onChange={(e) => setPackagingId(e.target.value)}><option value="">Sin definir</option>{packaging.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>{packagingId && <label>Cant. empaques<input type="number" min="0.001" step="0.001" value={packagingQty} onChange={(e) => setPackagingQty(Number(e.target.value))} /></label>}<label>Costo estimado de bordado<input type="number" min="0" step="0.01" value={embroideryCost} onChange={(e) => setEmbroideryCost(Number(e.target.value))} /></label><label>Mano de obra propia<input type="number" min="0" step="0.01" value={laborCost} onChange={(e) => setLaborCost(Number(e.target.value))} /></label></div>
      <div className="form-grid"><label>Recargo XL<input type="number" min="0" step="0.01" value={xlAdjustment} onChange={(e) => setXlAdjustment(Number(e.target.value))} /></label><label>Recargo XXL<input type="number" min="0" step="0.01" value={xxlAdjustment} onChange={(e) => setXxlAdjustment(Number(e.target.value))} /></label><label>Notas <span className="label-optional">opcional</span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label></div>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}{success && <p className="login-success" role="status">{success}</p>}<div className="actions"><button type="submit" disabled={saving || name.trim().length < 2}>{saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear producto"}</button>{editingId && <button className="secondary" type="button" onClick={reset}>Cancelar</button>}</div>
  </form></section><section><h2>Productos</h2>{!data.products.length ? <p className="muted">Todavía no hay productos registrados.</p> : <div className="list">{data.products.map((p) => <div className="row static" key={p.id}><span><strong>{p.name}</strong><small>{typeLabels[p.type] ?? p.type} · {Number(p.leadTimeDays ?? 25)} días · tela {p.defaultFabricQtyMeters ?? "-"} m · cierre {p.defaultClosureQty ?? "-"} · empaque {p.defaultPackagingQty ?? "-"} · bordado {fmt(p.defaultEmbroideryCost)}</small></span><span><strong>{fmt(p.baseSalePrice)}</strong><button className="ghost" type="button" onClick={() => edit(p)}>Editar</button><ArchiveButton entityType="PRODUCT" id={p.id} onArchived={onChanged} /></span></div>)}</div>}</section></div>;
}
