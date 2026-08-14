import React, { useState } from "react";
import type { Bootstrap, OrderDetail } from "./api";
import { workshopApi } from "./workshop-api";

const sizes = ["S", "M", "L", "XL", "XXL"] as const;
const editableProductStates = new Set(["ORDER_RECEIVED", "MATERIAL_PENDING", "READY_TO_CUT"]);

export function OrderEditForm({ order, data, onReload }: { order: OrderDetail; data: Bootstrap; onReload: () => Promise<void> }) {
  const item = order.items[0];
  const [editing, setEditing] = useState(false);
  const [customerId, setCustomerId] = useState(order.customer.id);
  const [productId, setProductId] = useState(item?.productId ?? "");
  const [size, setSize] = useState(item?.size ?? "M");
  const [color, setColor] = useState(item?.color ?? "");
  const [total, setTotal] = useState(order.financials.agreedTotalPrice);
  const [date, setDate] = useState(order.promisedDeliveryDate ?? "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canChangeProduct = editableProductStates.has(order.status);

  const reset = () => {
    setCustomerId(order.customer.id); setProductId(item?.productId ?? ""); setSize(item?.size ?? "M"); setColor(item?.color ?? "");
    setTotal(order.financials.agreedTotalPrice); setDate(order.promisedDeliveryDate ?? ""); setError("");
  };

  if (!editing) return <section><h2>Datos del pedido</h2><p className="muted">Cliente: {order.customer.name} · talla {item?.size ?? "-"} · color {item?.color ?? "-"} · entrega {order.promisedDeliveryDate ?? "sin fecha"}</p><button className="secondary" type="button" onClick={() => { reset(); setMessage(""); setEditing(true); }}>Editar pedido</button>{message && <p className="login-success" role="status">{message}</p>}</section>;

  const currentProductExists = data.products.some((product) => product.id === productId);
  const currentCustomerExists = data.customers.some((customer) => customer.id === customerId);

  return <section><h2>Editar pedido</h2><form className="form" onSubmit={async (event) => {
    event.preventDefault(); setError(""); setMessage("");
    try {
      await workshopApi.updateOrder({ id: order.id, customerId, ...(canChangeProduct ? { productId } : {}), size, color: color.trim(), agreedTotalPrice: total, promisedDeliveryDate: date || null });
      await onReload(); setEditing(false); setMessage("Pedido actualizado.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo actualizar el pedido."); }
  }}>
    <label>Cliente<select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>{!currentCustomerExists && <option value={order.customer.id}>{order.customer.name} · histórico</option>}{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
    <label>Producto<select disabled={!canChangeProduct} value={productId} onChange={(e) => setProductId(e.target.value)}>{!currentProductExists && productId && <option value={productId}>Producto histórico</option>}{data.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    {!canChangeProduct && <p className="muted">Producto y talla quedan bloqueados después de iniciar producción para conservar los materiales históricos.</p>}
    <label>Talla<select disabled={!canChangeProduct} value={size} onChange={(e) => setSize(e.target.value)}>{sizes.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Color<input value={color} onChange={(e) => setColor(e.target.value)} required /></label>
    <label>Total acordado<input type="number" min={Math.max(0.01, order.financials.totalPaid)} step="0.01" value={total} onChange={(e) => setTotal(Number(e.target.value))} required /></label>
    <label>Fecha prometida<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button>Guardar cambios</button><button className="secondary" type="button" onClick={() => { reset(); setEditing(false); }}>Cancelar</button></div>
  </form></section>;
}
