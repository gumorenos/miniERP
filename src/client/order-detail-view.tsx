import React from "react";
import { localDateInputValue } from "../domain/workshop";
import { api, type Bootstrap, type OrderDetail } from "./api";
import { ArchiveButton } from "./archive-button";
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
  const provider = data.providers[0];
  const sentJob = order.embroideryJobs.find((job) => job.status === "SENT");
  const terminal = order.status === "CANCELLED" || order.status === "CLOSED";
  const nextActions = [["MATERIAL_PENDING", "Material pendiente"], ["READY_TO_CUT", "Listo para corte"], ["ASSEMBLY", "Confección"], ["READY_FOR_DELIVERY", "Listo para entregar"], ["DELIVERED", "Entregar"], ["CLOSED", "Cerrar"]] as const;

  return <div className="stack">
    <section><h2>{order.orderNumber}</h2><p className="muted">{order.customer.name} · {statusLabels[order.status] ?? order.status}</p>
      <div className="actions"><ArchiveButton entityType="ORDER" id={order.id} onArchived={onArchived} /></div>
      <div className="metrics"><Metric label="Precio" value={money(order.financials.agreedTotalPrice)} /><Metric label="Pagado" value={money(order.financials.totalPaid)} /><Metric label="Saldo" value={money(order.financials.balance)} /><Metric label="Margen" value={money(order.financials.margin)} /></div>
      <div className="money-grid"><span>Costo estimado</span><strong>{money(order.financials.estimatedCost)}</strong><span>Costo real</span><strong>{money(order.financials.actualCost)}</strong><span>Costo margen</span><strong>{money(order.financials.costForMargin)}</strong></div>
    </section>

    <OrderEditForm order={order} data={data} onReload={onReload} />

    <section><h2>Flujo</h2>{terminal ? <p className="muted">Este pedido está {order.status === "CANCELLED" ? "cancelado" : "cerrado"}. Puedes corregir sus datos o borrar pagos, pero no avanzar el flujo.</p> : <div className="actions">
      <button onClick={async () => { await api.cut(order.id); await onReload(); }}>Cortar y descontar tela</button>
      {provider && <button onClick={async () => { const expected = new Date(); expected.setDate(expected.getDate() + 14); await api.sendEmbroidery(order.id, { providerId: provider.id, expectedReturnDate: localDateInputValue(expected), estimatedCost: 80 }); await onReload(); }}>Enviar bordado</button>}
      {sentJob && <button onClick={async () => { await api.receiveEmbroidery(order.id, sentJob.id, 80); await onReload(); }}>Recibir bordado</button>}
      {nextActions.map(([status, label]) => <button className="secondary" key={status} onClick={async () => { await api.transition(order.id, status); await onReload(); }}>{label}</button>)}
      <button className="ghost danger" onClick={async () => { if (!window.confirm("¿Cancelar este pedido?")) return; await api.transition(order.id, "CANCELLED"); await onReload(); }}>Cancelar pedido</button>
    </div>}</section>

    <PaymentsEditor order={order} onReload={onReload} />

    <section><h2>Bordado</h2>{order.embroideryJobs.length ? order.embroideryJobs.map((job) => <p className={job.overdueDays > 0 ? "warning" : "muted"} key={job.id}>{job.status} · retorno {job.expectedReturnDate ?? "-"} · atraso {job.overdueDays} días</p>) : <p className="muted">Sin bordado registrado.</p>}</section>
  </div>;
}
