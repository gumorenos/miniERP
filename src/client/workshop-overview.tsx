import React from "react";
import type { Bootstrap, OrderSummary } from "./api";

const statusLabels: Record<string, string> = {
  ORDER_RECEIVED: "Recibido",
  MATERIAL_PENDING: "Material",
  READY_TO_CUT: "Listo corte",
  CUT: "Cortado",
  AT_EMBROIDERER: "Bordador",
  EMBROIDERY_RECEIVED: "Bordado recibido",
  ASSEMBLY: "Confección",
  READY_FOR_DELIVERY: "Listo entrega",
  DELIVERED: "Entregado",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado"
};

const money = (value: number | string | null | undefined) => `S/ ${Number(value ?? 0).toFixed(2)}`;

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

export function DashboardView({ data }: { data: Bootstrap }) {
  const urgent = [...data.dashboard.lateOrders, ...data.dashboard.dueSoon].slice(0, 5);
  return <div className="stack">
    <section className="metrics">
      <Metric label="Activos" value={data.dashboard.activeOrders} />
      <Metric label="Bordador" value={data.dashboard.atEmbroidery} />
      <Metric label="Por cobrar" value={money(data.dashboard.money.receivable)} />
      <Metric label="Margen ref." value={money(data.dashboard.money.margin)} />
    </section>
    <section><h2>Urgente</h2>{urgent.length ? <OrderRows rows={urgent} /> : <p className="muted">Sin pedidos urgentes.</p>}{data.dashboard.lateEmbroideryJobs.length > 0 && <p className="warning">Hay {data.dashboard.lateEmbroideryJobs.length} bordado(s) atrasado(s).</p>}</section>
    <section><h2>Dinero</h2><div className="money-grid"><span>Ventas acordadas</span><strong>{money(data.dashboard.money.sales)}</strong><span>Cobrado</span><strong>{money(data.dashboard.money.collected)}</strong><span>Por cobrar</span><strong>{money(data.dashboard.money.receivable)}</strong></div></section>
  </div>;
}

export function OrdersView({ rows, onOpen }: { rows: OrderSummary[]; onOpen: (id: string) => void }) {
  return <section><h2>Pedidos</h2>{rows.length ? <OrderRows rows={rows} onOpen={onOpen} /> : <p className="muted">Sin pedidos todavía.</p>}</section>;
}

function OrderRows({ rows, onOpen }: { rows: OrderSummary[]; onOpen?: (id: string) => void }) {
  return <div className="list">{rows.map((row) => <button key={row.id} className="row" onClick={() => onOpen?.(row.id)}>
    <span><strong>{row.orderNumber}</strong><small>{row.customerName}{row.promisedDeliveryDate ? ` · ${row.promisedDeliveryDate}` : ""}</small></span>
    <span><b>{statusLabels[row.status] ?? row.status}</b><small>{money(row.agreedTotalPrice)}</small></span>
  </button>)}</div>;
}
