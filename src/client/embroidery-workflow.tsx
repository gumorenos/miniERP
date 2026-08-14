import React, { useMemo, useState } from "react";
import { localDateInputValue } from "../domain/workshop";
import { api, type Bootstrap, type OrderDetail } from "./api";

export function EmbroideryWorkflow({ order, data, onReload }: { order: OrderDetail; data: Bootstrap; onReload: () => Promise<void> }) {
  const item = order.items[0];
  const product = useMemo(() => data.products.find((row) => row.id === item?.productId), [data.products, item?.productId]);
  const sentJob = order.embroideryJobs.find((job) => job.status === "SENT");
  const [providerId, setProviderId] = useState(data.providers[0]?.id ?? "");
  const initialExpected = new Date(); initialExpected.setDate(initialExpected.getDate() + 14);
  const [expectedReturnDate, setExpectedReturnDate] = useState(localDateInputValue(initialExpected));
  const [estimatedCost, setEstimatedCost] = useState(Number(product?.defaultEmbroideryCost ?? 80));
  const [actualCost, setActualCost] = useState(Number(sentJob?.estimatedCost ?? product?.defaultEmbroideryCost ?? 80));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  if (sentJob) return <section><h2>Bordado pendiente</h2><p className="muted">Retorno esperado: {sentJob.expectedReturnDate ?? "sin fecha"}</p><form className="form" onSubmit={async (event) => { event.preventDefault(); setError(""); try { await api.receiveEmbroidery(order.id, sentJob.id, actualCost); await onReload(); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo recibir el bordado."); } }}><label>Costo real<input type="number" min="0" step="0.01" value={actualCost} onChange={(e) => setActualCost(Number(e.target.value))} /></label>{error && <p className="error" role="alert">{error}</p>}<button>Registrar devolución del bordado</button></form></section>;

  if (order.status !== "CUT") return null;
  if (!data.providers.length) return <section><h2>Bordado</h2><p className="warning">No hay bordadores registrados. Créalo en la pestaña Bordadores antes de enviar una prenda.</p></section>;

  return <section><h2>Enviar a bordado</h2><form className="form" onSubmit={async (event) => { event.preventDefault(); setError(""); try { await api.sendEmbroidery(order.id, { providerId, expectedReturnDate, estimatedCost, notes: notes || null }); await onReload(); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo enviar a bordado."); } }}><label>Bordador<select value={providerId} onChange={(e) => setProviderId(e.target.value)}>{data.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label><label>Fecha esperada de devolución<input type="date" value={expectedReturnDate} onChange={(e) => setExpectedReturnDate(e.target.value)} required /></label><label>Costo estimado<input type="number" min="0" step="0.01" value={estimatedCost} onChange={(e) => setEstimatedCost(Number(e.target.value))} /></label><label>Notas<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>{error && <p className="error" role="alert">{error}</p>}<button>Enviar al bordador</button></form></section>;
}
