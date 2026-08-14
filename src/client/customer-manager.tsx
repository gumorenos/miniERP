import React, { useEffect, useMemo, useState } from "react";
import { calculateCustomerMetrics } from "../domain/workshop";
import { api, type Bootstrap, type Customer, type OrderDetail } from "./api";

const money = (value: number | string | null | undefined) => `S/ ${Number(value ?? 0).toFixed(2)}`;

export function CustomerManager({
  data,
  onChanged,
  onOpenOrder
}: {
  data: Bootstrap;
  onChanged: () => Promise<void>;
  onOpenOrder: (id: string) => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<OrderDetail[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const selected = data.customers.find((customer) => customer.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setHistory([]);
      setHistoryError("");
      return;
    }

    const candidates = data.orders.filter((order) => order.customerName === selected.name);
    setLoadingHistory(true);
    setHistoryError("");
    Promise.all(candidates.map((order) => api.getOrder(order.id)))
      .then((orders) => {
        if (!cancelled) setHistory(orders.filter((order) => order.customer.id === selected.id));
      })
      .catch((error) => {
        if (!cancelled) setHistoryError(error instanceof Error ? error.message : "No se pudo cargar el historial.");
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => { cancelled = true; };
  }, [selectedId, selected?.id, selected?.name, data.orders]);

  if (selected) {
    return <CustomerProfile customer={selected} history={history} loading={loadingHistory} error={historyError} onBack={() => setSelectedId(null)} onOpenOrder={onOpenOrder} />;
  }
  return <CustomerList data={data} onChanged={onChanged} onSelect={setSelectedId} />;
}

function CustomerProfile({ customer, history, loading, error, onBack, onOpenOrder }: {
  customer: Customer;
  history: OrderDetail[];
  loading: boolean;
  error: string;
  onBack: () => void;
  onOpenOrder: (id: string) => Promise<void> | void;
}) {
  const metrics = useMemo(() => calculateCustomerMetrics(history.map((order) => ({
    status: order.status,
    orderDate: (order as unknown as { orderDate?: string }).orderDate,
    agreedTotalPrice: Number(order.financials.agreedTotalPrice),
    totalPaid: Number(order.financials.totalPaid)
  }))), [history]);

  return <div className="stack">
    <section>
      <button className="ghost" type="button" onClick={onBack}>← Volver a clientes</button>
      <h2>{customer.name}</h2>
      <p className="muted">{customer.phone ?? "Sin teléfono"} · {customer.instagramHandle ?? "Sin Instagram"}</p>
      {customer.notes && <p>{customer.notes}</p>}
      <div className="metrics">
        <ProfileMetric label="Pedidos" value={metrics.totalOrders} />
        <ProfileMetric label="Activos" value={metrics.activeOrders} />
        <ProfileMetric label="Vendido" value={money(metrics.totalSales)} />
        <ProfileMetric label="Por cobrar" value={money(metrics.balance)} />
      </div>
      <div className="money-grid">
        <span>Cobrado</span><strong>{money(metrics.totalPaid)}</strong>
        <span>Última compra</span><strong>{metrics.lastOrderDate ?? "-"}</strong>
      </div>
    </section>

    <section>
      <h2>Historial de pedidos</h2>
      {loading && <p className="muted">Cargando historial...</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && !error && history.length === 0 && <p className="muted">Todavía no hay pedidos para esta clienta.</p>}
      {!loading && history.length > 0 && <div className="list">{history.map((order) => <button className="row" key={order.id} onClick={() => onOpenOrder(order.id)}>
        <span><strong>{order.orderNumber}</strong><small>{order.status} · entrega {order.promisedDeliveryDate ?? "sin fecha"}</small></span>
        <span><strong>{money(order.financials.agreedTotalPrice)}</strong><small>saldo {money(order.financials.balance)}</small></span>
      </button>)}</div>}
    </section>
  </div>;
}

function ProfileMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function CustomerList({ data, onChanged, onSelect }: { data: Bootstrap; onChanged: () => Promise<void>; onSelect: (id: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    setError(""); setSuccess("");
    if (cleanName.length < 2) return setError("Ingresa un nombre de al menos 2 caracteres.");
    setSaving(true);
    try {
      await api.createCustomer({ name: cleanName, phone: phone.trim() || null, instagramHandle: instagramHandle.trim() || null, notes: notes.trim() || null });
      setName(""); setPhone(""); setInstagramHandle(""); setNotes("");
      await onChanged();
      setSuccess("Cliente creado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el cliente.");
    } finally { setSaving(false); }
  };

  return <div className="stack">
    <section><h2>Nuevo cliente</h2><form className="form" onSubmit={submit}>
      <label>Nombre *<input name="customer-name" autoComplete="name" placeholder="Nombre del cliente" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>
      <label>Teléfono<input name="customer-phone" autoComplete="tel" inputMode="tel" placeholder="Ej. 999 999 999" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <label>Instagram<input name="customer-instagram" autoComplete="off" placeholder="Ej. @cliente" value={instagramHandle} onChange={(event) => setInstagramHandle(event.target.value)} /></label>
      <label>Notas<input name="customer-notes" autoComplete="off" placeholder="Talla habitual, preferencias u otra referencia" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}{success && <p className="login-success" role="status">{success}</p>}
      <button type="submit" disabled={saving || name.trim().length < 2}>{saving ? "Guardando..." : "Crear cliente"}</button>
    </form></section>
    <section><h2>Clientes</h2>{data.customers.length === 0 ? <p className="muted">Todavía no hay clientes registrados.</p> : <div className="list">{data.customers.map((customer) => <button className="row" key={customer.id} onClick={() => onSelect(customer.id)}><span><strong>{customer.name}</strong><small>{customer.phone ?? customer.instagramHandle ?? "Sin contacto"}</small></span><strong>Ver ficha</strong></button>)}</div>}</section>
  </div>;
}
