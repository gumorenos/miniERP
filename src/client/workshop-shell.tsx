import React from "react";
import type { Bootstrap } from "./api";

const tabs = [
  ["dashboard", "Inicio"],
  ["agenda", "Agenda"],
  ["orders", "Pedidos"],
  ["newOrder", "Nuevo"],
  ["customers", "Clientes"],
  ["products", "Productos"],
  ["inventory", "Inventario"],
  ["providers", "Bordadores"],
  ["finance", "Compras/Gastos"],
  ["money", "Dinero"]
] as const;

const titles: Record<string, string> = {
  dashboard: "Taller", agenda: "Agenda", orders: "Pedidos", newOrder: "Nuevo pedido", orderDetail: "Detalle del pedido",
  customers: "Clientes", products: "Productos", inventory: "Inventario", providers: "Bordadores", finance: "Compras y gastos", money: "Dinero"
};

export function WorkshopShell({ data, screen, setScreen, error, children }: { data: Bootstrap; screen: string; setScreen: (screen: string) => void; error?: string | null; children: React.ReactNode }) {
  return <div className="app-shell">
    <header>
      <div><p className="eyebrow">{data.business.name}</p><h1>{titles[screen] ?? "Taller"}</h1></div>
      <div className="actions"><a className="ghost button-link" href="/account.html">Mi cuenta</a><a className="ghost button-link" href="/logout.html">Salir</a></div>
    </header>
    {data.demo && <div className="demo-banner">Datos demo de desarrollo. Editables; no son reglas de negocio.</div>}
    {error && <p className="error" role="alert">{error}</p>}
    <nav>{tabs.map(([id, label]) => <button className={screen === id ? "active" : ""} key={id} onClick={() => setScreen(id)}>{label}</button>)}</nav>
    <main>{children}</main>
  </div>;
}
