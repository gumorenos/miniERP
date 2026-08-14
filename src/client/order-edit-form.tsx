import React, { useState } from "react";
import type { Bootstrap, OrderDetail } from "./api";
import { workshopApi } from "./workshop-api";

export function OrderEditForm({ order, data, onReload }: { order: OrderDetail; data: Bootstrap; onReload: () => Promise<void> }) {
  const item = order.items[0];
  const customers = data.customers.some((customer) => customer.id === order.customer.id)
    ? data.customers
    : [order.customer, ...data.customers];
  const [editing, setEditing] = useState(false);
  const [customerId, setCustomerId] = useState(order.customer.id);
  const [size, setSize] = useState(item?.size ?? "S");
  const [color, setColor] = useState(item?.color ?? "");
  const [total, setTotal] = useState(Number(order.financials.agreedTotalPrice));
  const [delivery, setDelivery] = useState(order.promisedDeliveryDate ?? "");
  const [error, setError] = useState("");

  const resetFromOrder = () => {
    setCustomerId(order.customer.id);
    setSize(item?.size ?? "S");
    setColor(item?.color ?? "");
    setTotal(Number(order.financials.agreedTotalPrice));
    setDelivery(order.promisedDeliveryDate ?? "");
    setError("");
  };

  const beginEditing = () => { resetFromOrder(); setEditing(true); };
  const cancelEditing = () => { resetFromOrder(); setEditing(false); };

  if (!editing) return <button className="ghost" type="button" onClick={beginEditing}>Editar pedido</button>;

  return <form className="form" onSubmit={async (event) => {
    event.preventDefault(); setError("");
    try {
      await workshopApi.updateOrder({ id: order.id, customerId, size, color, agreedTotalPrice: total, promisedDeliveryDate: delivery || null });
      setEditing(false); await onReload();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo editar el pedido."); }
  }}>
    <label>Cliente<select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.id === order.customer.id && !data.customers.some((active) => active.id === customer.id) ? " · borrado" : ""}</option>)}</select></label>
    <label>Talla<select value={size} onChange={(e) => setSize(e.target.value)}>{["S","M","L","XL","XXL"].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Color<input value={color} onChange={(e) => setColor(e.target.value)} required /></label>
    <label>Total acordado<input type="number" min={order.financials.totalPaid} step="0.01" value={total} onChange={(e) => setTotal(Number(e.target.value))} required /></label>
    <label>Fecha prometida<input type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button>Guardar cambios</button><button className="secondary" type="button" onClick={cancelEditing}>Cancelar edición</button></div>
  </form>;
}
