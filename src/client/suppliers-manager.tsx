import React, { useEffect, useState } from "react";
import { operationsApi, type SupplierRow } from "./operations-api";

export function SuppliersManager({ onChanged }: { onChanged: () => Promise<void> }) {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => { setRows((await operationsApi.suppliers()).rows); };
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los proveedores.")); }, []);

  const reset = () => { setEditingId(null); setName(""); setPhone(""); setNotes(""); };
  const edit = (row: SupplierRow) => { setEditingId(row.id); setName(row.name); setPhone(row.phone ?? ""); setNotes(row.notes ?? ""); setError(""); setMessage(""); };

  return <div className="stack"><section><h2>{editingId ? "Editar proveedor" : "Nuevo proveedor"}</h2><p className="muted">Úsalo para telas, cierres, empaques u otros materiales que entran al inventario.</p><form className="form" onSubmit={async (event) => { event.preventDefault(); setError(""); setMessage(""); try { const wasEditing = Boolean(editingId); await operationsApi.saveSupplier({ action:wasEditing ? "update" : "create", ...(editingId ? { id:editingId } : {}), name:name.trim(), phone:phone.trim() || null, notes:notes.trim() || null }); reset(); await Promise.all([load(), onChanged()]); setMessage(wasEditing ? "Proveedor actualizado." : "Proveedor registrado."); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar el proveedor."); } }}>
    <label>Nombre<input value={name} minLength={2} required onChange={(event) => setName(event.target.value)} /></label><label>Teléfono / WhatsApp<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label>Notas <span className="label-optional">opcional</span><input value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{error && <p className="error" role="alert">{error}</p>}{message && <p className="login-success" role="status">{message}</p>}<div className="actions"><button>{editingId ? "Guardar" : "Crear proveedor"}</button>{editingId && <button className="secondary" type="button" onClick={reset}>Cancelar</button>}</div>
  </form></section><section><h2>Proveedores</h2>{rows.length ? <div className="list">{rows.map((row) => <div className="row static" key={row.id}><span><strong>{row.name}</strong><small>{row.phone || "Sin teléfono"}{row.notes ? ` · ${row.notes}` : ""}</small></span><span><button className="ghost" type="button" onClick={() => edit(row)}>Editar</button><button className="ghost danger" type="button" onClick={async () => { if (!confirm("¿Borrar este proveedor?")) return; try { await operationsApi.archiveSupplier(row.id); await Promise.all([load(), onChanged()]); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo borrar el proveedor."); } }}>Borrar</button></span></div>)}</div> : <p className="muted">Todavía no hay proveedores registrados.</p>}</section></div>;
}
