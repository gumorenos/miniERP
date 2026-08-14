import React from "react";
import type { Bootstrap } from "./api";

const tabs = [["dashboard", "Inicio", "⌂"], ["orders", "Pedidos", "▦"], ["workshop", "Taller", "✦"], ["contacts", "Contactos", "◌"], ["money", "Dinero", "S/"]] as const;

const titles: Record<string, string> = {
  dashboard: "Inicio", orders: "Pedidos", newOrder: "Nuevo pedido", orderDetail: "Detalle del pedido", workshop: "Taller", contacts: "Contactos", money: "Dinero"
};

function activeTab(screen: string) {
  if (screen === "newOrder" || screen === "orderDetail") return "orders";
  return screen;
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "brand-mark compact" : "brand-mark"} aria-label="Samiiwara"><span className="brand-bird">◜</span><span><strong>SAMIIWARA</strong>{!compact && <small>taller artesanal</small>}</span></div>;
}

export function WorkshopShell({ data, screen, setScreen, error, children }: { data: Bootstrap; screen: string; setScreen: (screen: string) => void; error?: string | null; children: React.ReactNode }) {
  const current = activeTab(screen);
  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-lockup"><BrandMark /><div><p className="eyebrow">Gestión del taller</p><h1>{titles[screen] ?? "Inicio"}</h1></div></div>
      <div className="actions header-actions"><a className="ghost button-link" href="/account.html">Mi cuenta</a><a className="ghost button-link" href="/logout.html">Salir</a></div>
    </header>
    {data.demo && <div className="demo-banner">Datos demo de desarrollo. Editables; no son reglas de negocio.</div>}
    {error && <p className="error action-error" role="alert">{error}</p>}
    <nav className="primary-nav" aria-label="Módulos principales">{tabs.map(([id, label, icon]) => <button className={current === id ? "active" : ""} key={id} onClick={() => setScreen(id)}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span></button>)}</nav>
    <main>{children}</main>
    <footer className="app-footer"><BrandMark compact /><span>Hecho para trabajar con calma, una prenda a la vez.</span></footer>
  </div>;
}
