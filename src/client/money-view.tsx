import React, { useEffect, useState } from "react";
import { localDateInputValue } from "../domain/workshop";
import { operationsApi, type MoneySummary } from "./operations-api";

const money = (value: number) => `S/ ${value.toFixed(2)}`;

export function MoneyView() {
  const [month, setMonth] = useState(localDateInputValue().slice(0, 7));
  const [summary, setSummary] = useState<MoneySummary | null>(null);
  const [error, setError] = useState("");
  const load = async (value = month) => { setError(""); try { setSummary(await operationsApi.money(value)); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar el resumen."); } };
  useEffect(() => { void load(); }, []);

  return <div className="stack"><section><h2>Dinero</h2><label>Mes<input type="month" value={month} onChange={(event) => { setMonth(event.target.value); void load(event.target.value); }} /></label>{error && <p className="error" role="alert">{error}</p>}</section>
    {summary && <><section><div className="metrics"><div className="metric"><span>Ventas registradas</span><strong>{money(summary.sales)}</strong></div><div className="metric"><span>Cobrado en el mes</span><strong>{money(summary.collected)}</strong></div><div className="metric"><span>Por cobrar actual</span><strong>{money(summary.receivable)}</strong></div><div className="metric"><span>Compras de materiales</span><strong>{money(summary.purchases)}</strong></div><div className="metric"><span>Otros gastos</span><strong>{money(summary.expenses)}</strong></div><div className="metric"><span>Flujo neto del mes</span><strong>{money(summary.netCash)}</strong></div></div></section>
    <section><h2>Cómo leerlo</h2><p className="muted">Flujo neto = cobros recibidos − compras de materiales − otros gastos. “Ventas registradas” usa los pedidos del mes y no equivale necesariamente al efectivo cobrado.</p></section></>}
  </div>;
}
