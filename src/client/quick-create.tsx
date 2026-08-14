import React, { useState } from "react";
import { api, type Customer, type Material, type Product } from "./api";
import { operationsApi, type ProviderRow } from "./operations-api";

type ModalProps = { title: string; description?: string; onClose: () => void; children: React.ReactNode };

export function QuickCreateModal({ title, description, onClose, children }: ModalProps) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="quick-create-title">
      <div className="modal-heading"><div><p className="eyebrow">Captura rápida</p><h2 id="quick-create-title">{title}</h2>{description && <p className="muted">{description}</p>}</div><button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}>×</button></div>
      {children}
    </section>
  </div>;
}

export function QuickCustomerForm({ onCreated, onCancel }: { onCreated: (customer: Customer) => Promise<void> | void; onCancel: () => void }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  return <form className="form" onSubmit={async (event) => { event.preventDefault(); setError(""); if (name.trim().length < 2) return setError("Ingresa un nombre de al menos 2 caracteres."); setSaving(true); try { await onCreated(await api.createCustomer({ name: name.trim(), phone: phone.trim() || null })); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el cliente."); } finally { setSaving(false); } }}>
    <label>Nombre *<input autoFocus autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>
    <label>Teléfono / WhatsApp<input autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button disabled={saving || name.trim().length < 2}>{saving ? "Guardando..." : "Crear y seleccionar"}</button><button className="ghost" type="button" onClick={onCancel}>Cancelar</button></div>
  </form>;
}

export function QuickProductForm({ onCreated, onCancel }: { onCreated: (product: Product) => Promise<void> | void; onCancel: () => void }) {
  const [name, setName] = useState(""); const [price, setPrice] = useState(0); const [type, setType] = useState("DRESS"); const [leadTimeDays, setLeadTimeDays] = useState(25); const [details, setDetails] = useState(false); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  return <form className="form" onSubmit={async (event) => { event.preventDefault(); setError(""); if (name.trim().length < 2 || price <= 0) return setError("Completa nombre y precio."); setSaving(true); try { await onCreated(await api.createProduct({ name: name.trim(), type, baseSalePrice: price, leadTimeDays })); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el producto."); } finally { setSaving(false); } }}>
    <label>Nombre del modelo *<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required minLength={2} placeholder="Ej. Vestido Margarita" /></label>
    <label>Precio base *<input type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(Number(event.target.value))} required /></label>
    <button className="disclosure" type="button" onClick={() => setDetails((current) => !current)}>{details ? "Ocultar detalles" : "Más detalles"} <span>{details ? "▴" : "▾"}</span></button>
    {details && <div className="form-grid"><label>Tipo<select value={type} onChange={(event) => setType(event.target.value)}><option value="DRESS">Vestido</option><option value="SKIRT">Falda</option><option value="JACKET">Casaca</option><option value="PANTS">Pantalón</option><option value="SHORTS">Short</option><option value="OTHER">Otro</option></select></label><label>Días de confección<input type="number" min="0" max="365" value={leadTimeDays} onChange={(event) => setLeadTimeDays(Number(event.target.value))} /></label></div>}
    <p className="helper">Podrás completar tela, bordado, costos y tallas desde Taller → Productos.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button disabled={saving || name.trim().length < 2 || price <= 0}>{saving ? "Guardando..." : "Crear y seleccionar"}</button><button className="ghost" type="button" onClick={onCancel}>Cancelar</button></div>
  </form>;
}

export function QuickMaterialForm({ onCreated, onCancel }: { onCreated: (material: Material) => Promise<void> | void; onCancel: () => void }) {
  const [name, setName] = useState(""); const [category, setCategory] = useState("FABRIC"); const [unit, setUnit] = useState("METER"); const [color, setColor] = useState(""); const [details, setDetails] = useState(false); const [initialQuantity, setInitialQuantity] = useState(0); const [unitCost, setUnitCost] = useState(0); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const changeCategory = (value: string) => { setCategory(value); if (value === "FABRIC") setUnit("METER"); else if (value === "THREAD") setUnit("SPOOL"); else setUnit("EACH"); };
  return <form className="form" onSubmit={async (event) => { event.preventDefault(); setError(""); if (name.trim().length < 2) return setError("Ingresa un nombre de material."); setSaving(true); try { await onCreated(await api.createMaterial({ name: name.trim(), category, unit, color: color.trim() || null, minimumStock: 0, initialQuantity, unitCost: initialQuantity > 0 ? unitCost : null })); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el material."); } finally { setSaving(false); } }}>
    <label>Material *<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required minLength={2} placeholder="Ej. Tela azul" /></label>
    <div className="form-grid"><label>Tipo<select value={category} onChange={(event) => changeCategory(event.target.value)}><option value="FABRIC">Tela</option><option value="CLOSURE">Cierre</option><option value="THREAD">Hilo</option><option value="PACKAGING">Empaque</option><option value="OTHER">Otro</option></select></label><label>Unidad<select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="METER">Metro</option><option value="EACH">Unidad</option><option value="SPOOL">Carrete</option><option value="UNIT">Otra</option></select></label></div>
    <label>Color <span className="label-optional">opcional</span><input value={color} onChange={(event) => setColor(event.target.value)} /></label>
    <button className="disclosure" type="button" onClick={() => setDetails((current) => !current)}>{details ? "Ocultar stock inicial" : "Agregar stock inicial"} <span>{details ? "▴" : "▾"}</span></button>
    {details && <div className="form-grid"><label>Cantidad<input type="number" min="0" step="0.001" value={initialQuantity} onChange={(event) => setInitialQuantity(Number(event.target.value))} /></label><label>Costo unitario<input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} /></label></div>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button disabled={saving || name.trim().length < 2}>{saving ? "Guardando..." : "Crear y seleccionar"}</button><button className="ghost" type="button" onClick={onCancel}>Cancelar</button></div>
  </form>;
}

export function QuickProviderForm({ onCreated, onCancel }: { onCreated: (provider: ProviderRow) => Promise<void> | void; onCancel: () => void }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  return <form className="form" onSubmit={async (event) => { event.preventDefault(); setError(""); if (name.trim().length < 2) return setError("Ingresa el nombre del bordador."); setSaving(true); try { await onCreated(await operationsApi.saveProvider({ action: "create", name: name.trim(), phone: phone.trim() || null })); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el bordador."); } finally { setSaving(false); } }}>
    <label>Nombre *<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>
    <label>Teléfono / WhatsApp<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button disabled={saving || name.trim().length < 2}>{saving ? "Guardando..." : "Crear y seleccionar"}</button><button className="ghost" type="button" onClick={onCancel}>Cancelar</button></div>
  </form>;
}
