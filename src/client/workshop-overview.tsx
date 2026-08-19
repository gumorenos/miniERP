import React from "react";
import type { Bootstrap, OrderSummary } from "./api";

const statusLabels: Record<string, string> = {
  ORDER_RECEIVED: "Recibido", MATERIAL_PENDING: "Material", READY_TO_CUT: "Listo corte", CUT: "Cortado",
  AT_EMBROIDERER: "Bordador", EMBROIDERY_RECEIVED: "Bordado recibido", ASSEMBLY: "Confección",
  READY_FOR_DELIVERY: "Listo entrega", DELIVERED: "Entregado", CLOSED: "Cerrado", CANCELLED: "Cancelado"
};
const money = (value: number | string | null | undefined) => `S/ ${Number(value ?? 0).toFixed(2)}`;

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

export function DashboardView({ data, onAction, onCapture }: { data: Bootstrap; onAction?: (action: "order" | "purchase" | "expense" | "adjustment") => void; onCapture?: () => void }) {
  const urgent = [...data.dashboard.lateOrders, ...data.dashboard.dueSoon].filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index).slice(0, 5);
  const lowStock = data.materials.filter((material) => Number(material.minimumStock ?? 0) > 0 && material.currentQuantity <= Number(material.minimumStock)).sort((a,b) => a.currentQuantity - b.currentQuantity).slice(0, 6);
  return <div className="stack">
    <section className="welcome-panel"><div><p className="eyebrow">Samiiwara · taller</p><h2>¿Qué requiere atención hoy?</h2><p className="muted">Registra primero. Los detalles pueden esperar.</p></div><div className="quick-actions"><button type="button" onClick={() => onAction?.("order")}><span>＋</span> Pedido</button><button type="button" className="quick-purple" onClick={() => onAction?.("purchase")}><span>＋</span> Compra</button><button type="button" className="quick-orange" onClick={() => onAction?.("expense")}><span>＋</span> Gasto</button><button type="button" className="quick-teal" onClick={() => onAction?.("adjustment")}><span>＋</span> Ajuste</button></div></section>
    <section className="metrics">
      <Metric label="Activos" value={data.dashboard.activeOrders} />
      <Metric label="Bordador" value={data.dashboard.atEmbroidery} />
      <Metric label="Listos entrega" value={data.dashboard.readyForDelivery} />
      <Metric label="Por cobrar" value={money(data.dashboard.money.receivable)} />
      <Metric label="Margen ref." value={money(data.dashboard.money.margin)} />
    </section>
    <section className="capture-launch"><div><p className="eyebrow">Menos data entry</p><h2>¿Te mandaron un pedido por chat?</h2><p className="muted">Pega el mensaje y te propongo los campos. Tú confirmas antes de guardarlo.</p></div><button type="button" onClick={onCapture}>＋ Pegar mensaje</button></section>
    <section><h2>Agenda del taller</h2><p className="muted">Entregas próximas, vencidas y trabajos que requieren atención.</p>{urgent.length ? <OrderRows rows={urgent} /> : <p className="muted">No hay entregas que requieran atención inmediata.</p>}{data.dashboard.lateEmbroideryJobs.length > 0 && <p className="warning">Hay {data.dashboard.lateEmbroideryJobs.length} bordado(s) atrasado(s).</p>}</section>
    <section><h2>Inventario bajo</h2>{lowStock.length ? <div className="list">{lowStock.map((material) => <div className="row static" key={material.id}><span><strong>{material.name}</strong><small>{material.color || material.category} · mínimo {Number(material.minimumStock).toFixed(2)}</small></span><strong>{material.currentQuantity.toFixed(2)} {material.unit === "METER" ? "m" : "un."}</strong></div>)}</div> : <p className="muted">No hay materiales por debajo de su mínimo configurado.</p>}</section>
    <section><h2>Dinero</h2><div className="money-grid"><span>Ventas acordadas</span><strong>{money(data.dashboard.money.sales)}</strong><span>Cobrado</span><strong>{money(data.dashboard.money.collected)}</strong><span>Por cobrar</span><strong>{money(data.dashboard.money.receivable)}</strong></div><p className="muted">Compras, gastos y flujo mensual están juntos en Dinero.</p></section>
  </div>;
}

const orderFilters = [["all", "Todos"], ["active", "Activos"], ["production", "Producción"], ["ready", "Listos"], ["closed", "Cerrados"]] as const;

export function OrdersView({ rows, onOpen, onNew }: { rows: OrderSummary[]; onOpen: (id: string) => void; onNew?: () => void }) {
  const [filter, setFilter] = React.useState<(typeof orderFilters)[number][0]>("active");
  const filtered = rows.filter((row) => {
    if (filter === "active") return !["CLOSED", "CANCELLED"].includes(row.status);
    if (filter === "production") return ["MATERIAL_PENDING", "READY_TO_CUT", "CUT", "AT_EMBROIDERER", "EMBROIDERY_RECEIVED", "ASSEMBLY"].includes(row.status);
    if (filter === "ready") return ["READY_FOR_DELIVERY", "DELIVERED"].includes(row.status);
    if (filter === "closed") return ["CLOSED", "CANCELLED"].includes(row.status);
    return true;
  });
  return <section><div className="section-heading"><div><p className="eyebrow">Operación</p><h2>Pedidos</h2><p className="muted">Todo el flujo del taller, en un solo lugar.</p></div><button type="button" onClick={onNew}>＋ Nuevo pedido</button></div><div className="filter-pills" role="tablist" aria-label="Filtrar pedidos">{orderFilters.map(([id, label]) => <button type="button" role="tab" aria-selected={filter === id} className={filter === id ? "selected" : ""} key={id} onClick={() => setFilter(id)}>{label}{id === "all" ? ` · ${rows.length}` : ""}</button>)}</div>{filtered.length ? <OrderRows rows={filtered} onOpen={onOpen} /> : <div className="empty-state"><span className="empty-mark">✦</span><p>No hay pedidos en este grupo.</p><button className="ghost" type="button" onClick={onNew}>Registrar un pedido</button></div>}</section>;
}

function OrderRows({ rows, onOpen }: { rows: OrderSummary[]; onOpen?: (id: string) => void }) {
  return <div className="list">{rows.map((row) => <button key={row.id} className="row" onClick={() => onOpen?.(row.id)}>
    <span><strong>{row.orderNumber}</strong><small>{row.customerName}{row.promisedDeliveryDate ? ` · ${row.promisedDeliveryDate}` : ""}</small></span>
    <span><b>{statusLabels[row.status] ?? row.status}</b><small>{money(row.agreedTotalPrice)}</small></span>
  </button>)}</div>;
}
