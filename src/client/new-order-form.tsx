import React, { useEffect, useMemo, useState } from "react";
import { localDateInputValue, suggestedDeliveryDate } from "../domain/workshop";
import { api, type Bootstrap, type Customer, type OrderDetail, type Product } from "./api";
import { getCapturePreferences, preferredId, rememberOrderPreferences } from "./capture-preferences";
import { QuickCreateModal, QuickCustomerForm, QuickProductForm } from "./quick-create";

const methods = [["YAPE", "Yape"], ["PLIN", "Plin"], ["CASH", "Efectivo"], ["BANK_TRANSFER", "Transferencia"], ["OTHER", "Otro"]] as const;
const sizes = ["S", "M", "L", "XL", "XXL"] as const;

export function NewOrderForm({ data, onCreated, onChanged, onCancel }: { data: Bootstrap; onCreated: (order: OrderDetail) => void | Promise<void>; onChanged?: () => Promise<void>; onCancel?: () => void }) {
  const remembered = getCapturePreferences().order;
  const [customers, setCustomers] = useState(data.customers);
  const [products, setProducts] = useState(data.products);
  const [quickCreate, setQuickCreate] = useState<"customer" | "product" | null>(null);
  const [customerId, setCustomerId] = useState(preferredId(data.customers, remembered?.customerId));
  const [productId, setProductId] = useState(preferredId(data.products, remembered?.productId));
  const [size, setSize] = useState<(typeof sizes)[number]>(sizes.includes(remembered?.size as (typeof sizes)[number]) ? remembered?.size as (typeof sizes)[number] : "S");
  const [color, setColor] = useState(remembered?.color || "Negro");
  const initialProduct = data.products.find((item) => item.id === productId) ?? data.products[0];
  const [delivery, setDelivery] = useState(initialProduct ? suggestedDeliveryDate(Number(initialProduct.leadTimeDays ?? 25)) : "");
  const [agreedTotalPrice, setAgreedTotalPrice] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [method, setMethod] = useState(remembered?.advanceMethod || "YAPE");
  const [paidAt, setPaidAt] = useState(localDateInputValue());
  const [notes, setNotes] = useState("");
  const [details, setDetails] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const product = products.find((item) => item.id === productId) ?? products[0];
  const leadTimeDays = Number(product?.leadTimeDays ?? 25);
  const suggestedPrice = useMemo(() => {
    const row = product?.sizePrices.find((item) => item.size === size);
    return Number(row?.fixedPrice ?? product?.baseSalePrice ?? 0) + Number(row?.priceAdjustment ?? 0);
  }, [product, size]);

  useEffect(() => { setCustomers(data.customers); }, [data.customers]);
  useEffect(() => { setProducts(data.products); }, [data.products]);
  useEffect(() => { setAgreedTotalPrice(suggestedPrice); }, [productId, size, suggestedPrice]);
  useEffect(() => { if (product) setDelivery(suggestedDeliveryDate(leadTimeDays)); }, [productId, leadTimeDays]);

  const refreshAfterQuickCreate = async () => { await onChanged?.(); };
  const createCustomer = async (customer: Customer) => { setCustomers((current) => [...current, customer].sort((a, b) => a.name.localeCompare(b.name))); setCustomerId(customer.id); setQuickCreate(null); await refreshAfterQuickCreate(); };
  const createProduct = async (created: Product) => { setProducts((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name))); setProductId(created.id); setQuickCreate(null); await refreshAfterQuickCreate(); };

  return <>
    <section className="capture-card">
      <div className="section-heading"><div><p className="eyebrow">Captura rápida</p><h2>Nuevo pedido</h2><p className="muted">Registra lo esencial ahora; completa los detalles cuando tengas tiempo.</p></div>{onCancel && <button className="ghost" type="button" onClick={onCancel}>Volver a pedidos</button>}</div>
      {!customers.length && <p className="warning">Necesitas un cliente para registrar el pedido. Créalo aquí mismo.</p>}
      {!products.length && <p className="warning">Necesitas un producto para registrar el pedido. Créalo aquí mismo.</p>}
      <form className="form" onSubmit={async (event) => {
        event.preventDefault(); setError("");
        if (agreedTotalPrice <= 0) return setError("Indica un precio mayor a cero.");
        if (advance < 0 || advance > agreedTotalPrice) return setError("El adelanto debe estar entre cero y el total del pedido.");
        setSaving(true);
        try {
          const order = await api.createOrder({ customerId, productId, size, color: color.trim(), quantity: 1, agreedTotalPrice, promisedDeliveryDate: delivery || null, advanceAmount: advance, advanceMethod: method, advancePaidAt: advance > 0 ? paidAt : null, notes: notes.trim() || null });
          rememberOrderPreferences({ customerId, productId, size, color: color.trim(), advanceMethod: method });
          await onCreated(order);
        } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el pedido."); } finally { setSaving(false); }
      }}>
        <div className="capture-grid">
          <div className="input-with-action"><label>Cliente *<select name="order-customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required><option value="">Selecciona...</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><button className="mini-action" type="button" onClick={() => setQuickCreate("customer")}>+ Cliente</button></div>
          <div className="input-with-action"><label>Producto *<select name="order-product" value={productId} onChange={(event) => setProductId(event.target.value)} required><option value="">Selecciona...</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="mini-action" type="button" onClick={() => setQuickCreate("product")}>+ Producto</button></div>
          <label>Talla *<select name="order-size" value={size} onChange={(event) => setSize(event.target.value as (typeof sizes)[number])}>{sizes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Color *<input name="order-color" value={color} onChange={(event) => setColor(event.target.value)} required /></label>
          <label>Precio *<input name="order-price" type="number" min="0.01" step="0.01" value={agreedTotalPrice} onChange={(event) => setAgreedTotalPrice(Number(event.target.value))} required /><span className="field-hint">Sugerido para {size}: S/ {suggestedPrice.toFixed(2)}</span></label>
          <label>Adelanto<input name="order-advance" type="number" min="0" max={agreedTotalPrice} step="0.01" value={advance} onChange={(event) => setAdvance(Number(event.target.value))} /></label>
          <label>Entrega prometida *<input name="order-delivery-date" type="date" value={delivery} onChange={(event) => setDelivery(event.target.value)} required /><span className="field-hint">Sugerida: {leadTimeDays} días</span></label>
        </div>
        <button className="disclosure" type="button" onClick={() => setDetails((current) => !current)}>{details ? "Ocultar detalles" : "Más detalles"} <span>{details ? "▴" : "▾"}</span></button>
        {details && <div className="details-panel"><label>Método del adelanto<select name="order-advance-method" value={method} onChange={(event) => setMethod(event.target.value)}>{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{advance > 0 && <label>Fecha del adelanto<input name="order-advance-date" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} /></label>}<label>Notas del pedido<textarea name="order-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Medidas, referencia, indicaciones..." /></label></div>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="capture-footer"><p className="price">Total: S/ {agreedTotalPrice.toFixed(2)}{advance > 0 && <small> · saldo S/ {(agreedTotalPrice - advance).toFixed(2)}</small>}</p><button disabled={saving || !customerId || !productId || !color.trim() || !delivery || agreedTotalPrice <= 0}>{saving ? "Guardando..." : "Registrar pedido"}</button></div>
      </form>
    </section>
    {quickCreate === "customer" && <QuickCreateModal title="Nuevo cliente" description="Solo necesitamos esto para continuar con el pedido." onClose={() => setQuickCreate(null)}><QuickCustomerForm onCreated={createCustomer} onCancel={() => setQuickCreate(null)} /></QuickCreateModal>}
    {quickCreate === "product" && <QuickCreateModal title="Nuevo producto" description="Crea el modelo ahora y completa sus materiales después." onClose={() => setQuickCreate(null)}><QuickProductForm onCreated={createProduct} onCancel={() => setQuickCreate(null)} /></QuickCreateModal>}
  </>;
}
