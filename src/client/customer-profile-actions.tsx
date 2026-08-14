import React, { useState } from "react";
import type { Customer } from "./api";
import { workshopApi } from "./workshop-api";
import { ArchiveButton } from "./archive-button";

export function CustomerProfileActions({ customer, onChanged, onArchived }: { customer: Customer; onChanged: () => Promise<void>; onArchived: () => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [instagram, setInstagram] = useState(customer.instagramHandle ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const resetFromCustomer = () => {
    setName(customer.name); setPhone(customer.phone ?? ""); setInstagram(customer.instagramHandle ?? ""); setNotes(customer.notes ?? ""); setError("");
  };
  const begin = () => { resetFromCustomer(); setMessage(""); setEditing(true); };
  const cancel = () => { resetFromCustomer(); setEditing(false); };

  if (!editing) return <div><div className="actions"><button className="secondary" type="button" onClick={begin}>Editar cliente</button><ArchiveButton entityType="CUSTOMER" id={customer.id} onArchived={onArchived} /></div>{message && <p className="login-success" role="status">{message}</p>}</div>;

  return <form className="form" onSubmit={async (event) => {
    event.preventDefault(); setError(""); setMessage("");
    if (name.trim().length < 2) return setError("Ingresa un nombre de al menos 2 caracteres.");
    try {
      await workshopApi.updateCustomer({ id: customer.id, name: name.trim(), phone: phone.trim() || null, instagramHandle: instagram.trim() || null, notes: notes.trim() || null });
      await onChanged(); setEditing(false); setMessage("Cliente actualizado.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo actualizar el cliente."); }
  }}>
    <label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required /></label>
    <label>Teléfono<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
    <label>Instagram<input value={instagram} onChange={(e) => setInstagram(e.target.value)} /></label>
    <label>Notas<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button>Guardar cambios</button><button className="secondary" type="button" onClick={cancel}>Cancelar edición</button></div>
  </form>;
}
