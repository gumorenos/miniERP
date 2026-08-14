import React from "react";
import { customerOrderMessage, whatsappUrl } from "../domain/whatsapp";
import { api, type Bootstrap, type OrderDetail } from "./api";
import { ArchiveButton } from "./archive-button";
import { EmbroideryWorkflow } from "./embroidery-workflow";
import { operationsApi } from "./operations-api";
import { OrderEditForm } from "./order-edit-form";
import { PaymentsEditor } from "./payments-editor";

const statusLabels: Record<string, string> = {
  ORDER_RECEIVED: "Recibido", MATERIAL_PENDING: "Material", READY_TO_CUT: "Listo corte", CUT: "Cortado",
  AT_EMBROIDERER: "Bordador", EMBROIDERY_RECEIVED: "Bordado recibido", ASSEMBLY: "Confección",
  READY_FOR_DELIVERY: "Listo entrega", DELIVERED: "Entregado", CLOSED: "Cerrado", CANCELLED: "Cancelado"
};
const money = (value: number | string | null | undefined) => `S/ ${Number(value ?? 0).toFixed(2)}`;

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

export function OrderDetailView({ order, data, onReload, onArchived }: { order: OrderDetail; data: Bootstrap; onReload: () => Promise<void>; onArchived: () => Promise<void> | void }) {
  const item = order.items[0];
  const terminal = order.status === "CANCELLED" || order.status === "CLOSED";
  const nextActions = [["MATERIAL_PENDING", "Material pendiente"], ["READY_TO_CUT", "Listo para corte"], ["DELIVERED", "Entregar"], ["CLOSED", "Cerrar"]] as const;
  const message = customerOrderMessage({ customerName: order.customer.name, orderNumber: order.orderNumber, status: order.status, balance: order.financials.balance });
  const customerWhatsApp = order.customer.phone ? whatsappUrl(order.customer.phone, message) : null;

  return <div className="stack">
    <section><h2>{order.orderNumber}</h2><p className="muted">{order.customer.name} · {statusLabels[order.status] ?? order.status}</p>
      <div className="actions">{customerWhatsApp && <a className="secondary button-link" href={customerWhatsApp} target="_blank" rel="noreferrer">WhatsApp clienta</a>}<ArchiveButton entityType="ORDER" id={order.id} onArchived={onArchived} /></div>
      <div className="metrics"><Metric label="Precio" value={money(order.financials.agreedTotalPrice)} /><Metric label="Pagado" value={money(order.financials.totalPaid)} /><Metric label="Saldo" value={money(order.financials.balance)} /><Metric label="Margen" value={money(order.financials.margin)} /></div>
      {item && <p className="muted">Talla {item.size} · color {item.color} · tela planificada {item.plannedFabricQty ?? "-"} m</p>}
      <div className="money-grid"><span>Costo estimado</span><strong>{money(order.financials.estimatedCost)}</strong><span>Costo real</span><strong>{money(order.financials.actualCost)}</strong><span>Costo margen</span><strong>{money(order.financials.costForMargin)}</strong></div>
    </section>

    <OrderEditForm order={order} data={data} onReload={onReload} />

    <section><h2>Flujo</h2>{terminal ? <p className="muted">Este pedido está {order.status === "CANCELLED" ? "cancelado" : "cerrado"}. Puedes corregir sus datos o borrar pagos, pero no avanzar el flujo.</p> : <div className="actions">
      <button onClick={async () => { await api.cut(order.id); await onReload(); }}>Cortar y descontar tela</button>
      <button className="secondary" onClick={async () => { await operationsApi.startAssembly(order.id); await onReload(); }}>Iniciar confección</button>
      <button className="secondary" onClick={async () => { await operationsApi.readyForDelivery(order.id); await onReload(); }}>Listo para entregar</button>
      {nextActions.map(([status, label]) => <button className="secondary" key={status} onClick={async () => { await api.transition(order.id, status); await onReload(); }}>{label}</button>)}
      <button className="ghost danger" onClick={async () => { if (!window.confirm("¿Cancelar este pedido?")) return; await api.transition(order.id, "CANCELLED"); await onReload(); }}>Cancelar pedido</button>
    </div>}</section>

    {!terminal && <EmbroideryWorkflow order={order} data={data} onReload={onReload} />}
    <PaymentsEditor order={order} onReload={onReload} />

    <section><h2>Historial de bordado</h2>{order.embroideryJobs.length ? order.embroideryJobs.map((job) => <p className={job.overdueDays > 0 ? "warning" : "muted"} key={job.id}>{job.status} · retorno {job.expectedReturnDate ?? "-"} · atraso {job.overdueDays} días</p>) : <p className="muted">Sin bordado registrado.</p>}</section>
  </div>;
}
