import React, { useEffect, useState } from "react";
import { localDateInputValue } from "../domain/workshop";
import { api, type OrderDetail } from "./api";
import { workshopApi } from "./workshop-api";
import { ArchiveButton } from "./archive-button";

const methods = [["YAPE", "Yape"], ["PLIN", "Plin"], ["CASH", "Efectivo"], ["BANK_TRANSFER", "Transferencia"], ["OTHER", "Otro"]] as const;
const fmt = (value: string | number) => `S/ ${Number(value).toFixed(2)}`;
const suggestedAmount = (balance: number) => balance > 0 ? Math.min(100, balance) : 0;

export function PaymentsEditor({ order, onReload }: { order: OrderDetail; onReload: () => Promise<void> }) {
  const [amount, setAmount] = useState(suggestedAmount(order.financials.balance));
  const [method, setMethod] = useState("YAPE");
  const [paidAt, setPaidAt] = useState(localDateInputValue());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editingId) setAmount(suggestedAmount(order.financials.balance));
  }, [order.financials.balance, editingId]);

  const reset = () => { setEditingId(null); setMethod("YAPE"); setPaidAt(localDateInputValue()); setError(""); };

  return <section><h2>Pagos</h2>
    <form className="form" onSubmit={async (event) => {
      event.preventDefault(); setError("");
      try {
        if (editingId) await workshopApi.updatePayment(order.id, { paymentId: editingId, amount, method, paidAt });
        else await api.pay(order.id, { amount, method, paidAt });
        reset(); await onReload();
      } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar el pago."); }
    }}>
      <label>Monto<input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} required /></label>
      <label>Método<select value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Fecha de pago<input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button disabled={amount <= 0}>{editingId ? "Guardar pago" : "Registrar pago"}</button>{editingId && <button className="secondary" type="button" onClick={reset}>Cancelar</button>}</div>
    </form>
    <div className="list">{order.payments.map((payment) => <div className="row static" key={payment.id}><span><strong>{payment.method}</strong><small>{new Date(payment.paidAt).toLocaleDateString()}</small></span><span><strong>{fmt(payment.amount)}</strong><button className="ghost" type="button" onClick={() => { setEditingId(payment.id); setAmount(Number(payment.amount)); setMethod(payment.method); setPaidAt(localDateInputValue(new Date(payment.paidAt))); }}>Editar</button><ArchiveButton entityType="PAYMENT" id={payment.id} onArchived={async () => { if (editingId === payment.id) reset(); await onReload(); }} /></span></div>)}</div>
  </section>;
}
