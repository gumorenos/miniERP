import React, { useState } from "react";
import type { Bootstrap, OrderDetail } from "./api";
import { operationsApi } from "./operations-api";

export function EmbroideryJobHistory({ order, data, onReload }: { order: OrderDetail; data: Bootstrap; onReload: () => Promise<void> }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [actualCost, setActualCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const startEdit = (job: OrderDetail["embroideryJobs"][number]) => {
    setEditingId(job.id); setProviderId(job.providerId); setExpectedReturnDate(job.expectedReturnDate ?? "");
    setEstimatedCost(Number(job.estimatedCost ?? 0)); setActualCost(Number(job.actualCost ?? 0)); setNotes(job.notes ?? ""); setError(""); setMessage("");
  };

  if (!order.embroideryJobs.length) return <section><h2>Historial de bordado</h2><p className="muted">Sin bordado registrado.</p></section>;

  return <section><h2>Historial de bordado</h2>
    {editingId && (() => {
      const job = order.embroideryJobs.find((row) => row.id === editingId);
      if (!job) return null;
      const received = job.status === "RECEIVED";
      return <form className="form" onSubmit={async (event) => {
        event.preventDefault(); setError(""); setMessage("");
        try {
          await operationsApi.updateEmbroideryJob(job.id, received
            ? { actualCost, notes: notes.trim() || null }
            : { providerId, expectedReturnDate: expectedReturnDate || null, estimatedCost, notes: notes.trim() || null });
          setEditingId(null); await onReload(); setMessage("Trabajo de bordado actualizado.");
        } catch (err) { setError(err instanceof Error ? err.message : "No se pudo actualizar el bordado."); }
      }}>
        {!received && <><label>Bordador<select value={providerId} onChange={(e) => setProviderId(e.target.value)}>{data.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label><label>Retorno esperado<input type="date" value={expectedReturnDate} onChange={(e) => setExpectedReturnDate(e.target.value)} /></label><label>Costo estimado<input type="number" min="0" step="0.01" value={estimatedCost} onChange={(e) => setEstimatedCost(Number(e.target.value))} /></label></>}
        {received && <label>Costo real<input type="number" min="0" step="0.01" value={actualCost} onChange={(e) => setActualCost(Number(e.target.value))} /></label>}
        <label>Notas<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}<div className="actions"><button>Guardar corrección</button><button type="button" className="secondary" onClick={() => setEditingId(null)}>Cancelar</button></div>
      </form>;
    })()}
    {message && <p className="login-success" role="status">{message}</p>}{error && !editingId && <p className="error" role="alert">{error}</p>}
    <div className="list">{order.embroideryJobs.map((job) => {
      const provider = data.providers.find((row) => row.id === job.providerId);
      return <div className="row static" key={job.id}><span><strong>{provider?.name ?? "Bordador histórico"} · {job.status}</strong><small>Enviado {job.sentAt ? new Date(job.sentAt).toLocaleDateString() : "-"} · retorno {job.expectedReturnDate ?? "-"} · est. S/ {Number(job.estimatedCost ?? 0).toFixed(2)}{job.actualCost != null ? ` · real S/ ${Number(job.actualCost).toFixed(2)}` : ""}{job.notes ? ` · ${job.notes}` : ""}</small></span><span><button className="ghost" onClick={() => startEdit(job)}>Editar</button><button className="ghost danger" onClick={async () => { if (!confirm("¿Anular este trabajo de bordado?")) return; try { await operationsApi.archiveEmbroideryJob(job.id); setEditingId(null); await onReload(); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo anular el bordado."); } }}>Borrar</button></span></div>;
    })}</div>
  </section>;
}
