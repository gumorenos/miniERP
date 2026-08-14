import React, { useEffect, useMemo, useState } from "react";
import { localDateInputValue, suggestedDeliveryDate } from "../domain/workshop";
import { api, type Bootstrap, type OrderDetail } from "./api";

const methods = [["YAPE", "Yape"], ["PLIN", "Plin"], ["CASH", "Efectivo"], ["BANK_TRANSFER", "Transferencia"], ["OTHER", "Otro"]] as const;

export function NewOrderForm({ data, onCreated }: { data: Bootstrap; onCreated: (order: OrderDetail) => void }) {
  const initial = data.products[0];
  const [customerId, setCustomerId] = useState(data.customers[0]?.id ?? "");
  const [productId, setProductId] = useState(initial?.id ?? "");
  const product = data.products.find((item) => item.id === productId) ?? initial;
  const leadTimeDays = Number(product?.leadTimeDays ?? 25);
  const [size, setSize] = useState("S");
  const [color, setColor] = useState("Negro");
  const [delivery, setDelivery] = useState(product ? suggestedDeliveryDate(leadTimeDays) : "");
  const [advance, setAdvance] = useState(0);
  const [method, setMethod] = useState("YAPE");
  const [paidAt, setPaidAt] = useState(localDateInputValue());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const price = useMemo(() => {
    const row = product?.sizePrices.find((item) => item.size === size);
    return Number(row?.fixedPrice ?? product?.baseSalePrice ?? 0) + Number(row?.priceAdjustment ?? 0);
  }, [product, size]);

  useEffect(() => { if (product) setDelivery(suggestedDeliveryDate(leadTimeDays)); }, [productId, leadTimeDays]);

  return <section><h2>Nuevo pedido</h2>
    {!data.customers.length && <p className="warning">Crea un cliente primero.</p>}
    {!data.products.length && <p className="warning">Crea un producto primero.</p>}
    <form className="form" onSubmit={async (event) => {
      event.preventDefault(); setError("");
      if (advance < 0 || advance > price) return setError("El adelanto debe estar entre cero y el total del pedido.");
      setSaving(true);
      try {
        onCreated(await api.createOrder({ customerId, productId, size, color, quantity: 1, agreedTotalPrice: price,
          promisedDeliveryDate: delivery || null, advanceAmount: advance, advanceMethod: method,
          advancePaidAt: advance > 0 ? paidAt : null }));
      } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el pedido."); }
      finally { setSaving(false); }
    }}>
      <label>Cliente<select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Producto<select value={productId} onChange={(e) => setProductId(e.target.value)}>{data.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Talla<select value={size} onChange={(e) => setSize(e.target.value)}>{["S","M","L","XL","XXL"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Color<input value={color} onChange={(e) => setColor(e.target.value)} required /></label>
      <label>Fecha prometida<input type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} /></label>
      {product && <p className="muted">Sugerida: {leadTimeDays} días. Puedes cambiarla.</p>}
      <p className="price">Total: S/ {price.toFixed(2)}</p>
      <label>Adelanto recibido<input type="number" min="0" max={price} step="0.01" value={advance} onChange={(e) => setAdvance(Number(e.target.value))} /></label>
      {advance > 0 && <><label>Método<select value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Fecha del adelanto<input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></label></>}
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={saving || !customerId || !productId}>{saving ? "Guardando..." : "Crear pedido"}</button>
    </form>
  </section>;
}
