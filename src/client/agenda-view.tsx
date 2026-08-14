import React, { useEffect, useMemo, useState } from "react";
import { localDateInputValue } from "../domain/workshop";
import { customerOrderMessage, whatsappUrl } from "../domain/whatsapp";
import { operationsApi, type AgendaData } from "./operations-api";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return localDateInputValue(value);
}

export function AgendaView({ onOpenOrder }: { onOpenOrder: (id: string) => void | Promise<void> }) {
  const [data, setData] = useState<AgendaData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { operationsApi.agenda().then(setData).catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar la agenda.")); }, []);
  const today = localDateInputValue();
  const weekEnd = addDays(today, 7);
  const grouped = useMemo(() => {
    const orders = data?.orders ?? [];
    return {
      overdue: orders.filter((row) => row.promisedDeliveryDate < today),
      next7: orders.filter((row) => row.promisedDeliveryDate >= today && row.promisedDeliveryDate <= weekEnd),
      later: orders.filter((row) => row.promisedDeliveryDate > weekEnd)
    };
  }, [data, today, weekEnd]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p>Cargando agenda...</p>;

  const OrderRows = ({ rows }: { rows: AgendaData["orders"] }) => rows.length ? <div className="list">{rows.map((row) => {
    const message = customerOrderMessage({ customerName: row.customerName, orderNumber: row.orderNumber, status: row.status, balance: row.balance });
    const link = row.phone ? whatsappUrl(row.phone, message) : null;
    return <div className="row static" key={row.id}><span><strong>{row.orderNumber} · {row.customerName}</strong><small>{row.promisedDeliveryDate} · {row.status} · saldo S/ {row.balance.toFixed(2)}</small></span><span><button className="ghost" onClick={() => void onOpenOrder(row.id)}>Abrir</button>{link && <a className="ghost button-link" href={link} target="_blank" rel="noreferrer">WhatsApp</a>}</span></div>;
  })}</div> : <p className="muted">Sin pedidos.</p>;

  return <div className="stack">
    <section><h2>Agenda del taller</h2><p className="muted">Entregas prometidas y trabajos actualmente con el bordador.</p></section>
    <section><h2>Vencidos</h2><OrderRows rows={grouped.overdue} /></section>
    <section><h2>Próximos 7 días</h2><OrderRows rows={grouped.next7} /></section>
    <section><h2>Más adelante</h2><OrderRows rows={grouped.later} /></section>
    <section><h2>En bordado</h2>{data.embroidery.length ? <div className="list">{data.embroidery.map((job) => {
      const providerLink = job.providerPhone ? whatsappUrl(job.providerPhone, `Hola, consulto por el bordado del pedido ${job.orderNumber} de Samiiwara. Fecha esperada: ${job.expectedReturnDate ?? "por confirmar"}.`) : null;
      return <div className="row static" key={job.id}><span><strong>{job.orderNumber} · {job.providerName}</strong><small>{job.customerName} · retorno {job.expectedReturnDate ?? "sin fecha"}</small></span><span><button className="ghost" onClick={() => void onOpenOrder(job.orderId)}>Abrir</button>{providerLink && <a className="ghost button-link" href={providerLink} target="_blank" rel="noreferrer">WhatsApp bordador</a>}</span></div>;
    })}</div> : <p className="muted">No hay trabajos enviados al bordador.</p>}</section>
  </div>;
}
