import React, { useEffect, useState } from "react";
import { api, type Bootstrap, type OrderDetail } from "./api";
import { workshopApi } from "./workshop-api";
import { operationsApi } from "./operations-api";
import { filterBootstrap, filterOrderDetail } from "./archive-filter";
import { WorkshopShell } from "./workshop-shell";
import { DashboardView, OrdersView } from "./workshop-overview";
import { CustomerManager } from "./customer-manager";
import { ProductsManager } from "./products-manager";
import { InventoryManager } from "./inventory-manager";
import { StockEntriesManager } from "./stock-entries-manager";
import { FinishedStockManager } from "./finished-stock-manager";
import { NewOrderForm } from "./new-order-form";
import { OrderDetailView } from "./order-detail-view";
import { SizeConsumptionPanel } from "./size-consumption-panel";
import { FinanceManager } from "./finance-manager";
import { MoneyView } from "./money-view";
import { ProvidersManager } from "./providers-manager";
import { SuppliersManager } from "./suppliers-manager";

type WorkshopTab = "products" | "materials" | "finished";
type ContactsTab = "all" | "customers" | "providers" | "suppliers";
type MoneyTab = "summary" | "purchases" | "expenses";

export function WorkshopApp() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [screen, setScreen] = useState("dashboard");
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [workshopTab, setWorkshopTab] = useState<WorkshopTab>("products");
  const [contactsTab, setContactsTab] = useState<ContactsTab>("all");
  const [moneyTab, setMoneyTab] = useState<MoneyTab>("summary");
  const [error, setError] = useState<string | null>(null);

  const loadActiveData = async () => {
    const [next, dashboard, archived] = await Promise.all([api.bootstrap(), operationsApi.dashboard(), workshopApi.archived()]);
    setData(filterBootstrap({ ...next, dashboard }, archived.records));
    return archived.records;
  };
  const reload = async (): Promise<void> => { setError(null); await loadActiveData(); };
  const openOrder = async (id: string) => {
    setError(null);
    try {
      const [order, archived] = await Promise.all([api.getOrder(id), workshopApi.archived()]);
      setSelectedOrder(filterOrderDetail(order, archived.records)); setScreen("orderDetail");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo abrir el pedido."); }
  };
  const reloadSelectedOrder = async () => {
    if (!selectedOrder) return;
    const [order, next, dashboard, archived] = await Promise.all([api.getOrder(selectedOrder.id), api.bootstrap(), operationsApi.dashboard(), workshopApi.archived()]);
    setSelectedOrder(filterOrderDetail(order, archived.records)); setData(filterBootstrap({ ...next, dashboard }, archived.records));
  };
  const goToAction = (action: "order" | "purchase" | "expense" | "adjustment") => {
    if (action === "order") setScreen("newOrder");
    if (action === "purchase") { setMoneyTab("purchases"); setScreen("money"); }
    if (action === "expense") { setMoneyTab("expenses"); setScreen("money"); }
    if (action === "adjustment") { setWorkshopTab("materials"); setScreen("workshop"); }
  };

  useEffect(() => { reload().catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el taller.")); }, []);

  if (!data) return <main className="app-shell loading-screen"><p>{error ?? "Cargando taller..."}</p></main>;

  return <WorkshopShell data={data} screen={screen} setScreen={setScreen} error={error}>
    {screen === "dashboard" && <DashboardView data={data} onAction={goToAction} />}
    {screen === "orders" && <OrdersView rows={data.orders} onOpen={openOrder} onNew={() => setScreen("newOrder")} />}
    {screen === "newOrder" && <NewOrderForm data={data} onChanged={reload} onCancel={() => setScreen("orders")} onCreated={async (order) => { const archived = await loadActiveData(); setSelectedOrder(filterOrderDetail(order, archived)); setScreen("orderDetail"); }} />}
    {screen === "orderDetail" && selectedOrder && <OrderDetailView order={selectedOrder} data={data} onReload={reloadSelectedOrder} onArchived={async () => { setSelectedOrder(null); setScreen("orders"); await reload(); }} />}
    {screen === "workshop" && <WorkshopHub tab={workshopTab} setTab={setWorkshopTab} data={data} onChanged={reload} />}
    {screen === "contacts" && <ContactsHub tab={contactsTab} setTab={setContactsTab} data={data} onChanged={reload} onOpenOrder={openOrder} />}
    {screen === "money" && <MoneyHub tab={moneyTab} setTab={setMoneyTab} data={data} onChanged={reload} />}
  </WorkshopShell>;
}

function Subnav<T extends string>({ items, value, onChange }: { items: ReadonlyArray<readonly [T, string]>; value: T; onChange: (value: T) => void }) {
  return <div className="subnav" role="tablist">{items.map(([id, label]) => <button type="button" role="tab" aria-selected={value === id} className={value === id ? "active" : ""} key={id} onClick={() => onChange(id)}>{label}</button>)}</div>;
}

function ModuleIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <section className="module-intro"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p className="muted">{description}</p></section>;
}

function WorkshopHub({ tab, setTab, data, onChanged }: { tab: WorkshopTab; setTab: (tab: WorkshopTab) => void; data: Bootstrap; onChanged: () => Promise<void> }) {
  return <div className="stack"><ModuleIntro eyebrow="Taller" title="Materiales y prendas, sin perder el hilo" description="Aquí vive la operación interna: modelos, insumos y prendas terminadas." /><Subnav items={[["products", "Productos"], ["materials", "Materiales"], ["finished", "Prendas terminadas"]] as const} value={tab} onChange={setTab} />{tab === "products" && <div className="stack"><ProductsManager data={data} onChanged={onChanged} /><SizeConsumptionPanel data={data} /></div>}{tab === "materials" && <div className="stack"><InventoryManager data={data} onChanged={onChanged} /><StockEntriesManager data={data} onChanged={onChanged} /></div>}{tab === "finished" && <FinishedStockManager data={data} />}</div>;
}

function ContactsHub({ tab, setTab, data, onChanged, onOpenOrder }: { tab: ContactsTab; setTab: (tab: ContactsTab) => void; data: Bootstrap; onChanged: () => Promise<void>; onOpenOrder: (id: string) => Promise<void> }) {
  return <div className="stack"><ModuleIntro eyebrow="Contactos" title="Una ficha para cada relación del taller" description="Clientes, bordadores y proveedores quedan juntos para que no tengas que recordar dónde vive cada dato." /><Subnav items={[["all", "Todos"], ["customers", "Clientes"], ["providers", "Bordadores"], ["suppliers", "Proveedores"]] as const} value={tab} onChange={setTab} />{tab === "all" && <section><div className="contact-cards"><button type="button" className="contact-card" onClick={() => setTab("customers")}><span className="contact-icon magenta">♧</span><span><strong>Clientes</strong><small>{data.customers.length} registrados</small></span><b>Ver →</b></button><button type="button" className="contact-card" onClick={() => setTab("providers")}><span className="contact-icon purple">✤</span><span><strong>Bordadores</strong><small>{data.providers.length} registrados</small></span><b>Ver →</b></button><button type="button" className="contact-card" onClick={() => setTab("suppliers")}><span className="contact-icon teal">＋</span><span><strong>Proveedores</strong><small>{data.suppliers.length} registrados</small></span><b>Ver →</b></button></div></section>}{tab === "customers" && <CustomerManager data={data} onChanged={onChanged} onOpenOrder={onOpenOrder} />}{tab === "providers" && <ProvidersManager onChanged={onChanged} />}{tab === "suppliers" && <SuppliersManager onChanged={onChanged} />}</div>;
}

function MoneyHub({ tab, setTab, data, onChanged }: { tab: MoneyTab; setTab: (tab: MoneyTab) => void; data: Bootstrap; onChanged: () => Promise<void> }) {
  return <div className="stack"><ModuleIntro eyebrow="Dinero" title="Compras y gastos, con una lectura clara" description="Compra es lo que entra al inventario. Gasto es lo que sale sin convertirse en material." /><Subnav items={[["summary", "Resumen"], ["purchases", "Compras"], ["expenses", "Gastos"]] as const} value={tab} onChange={setTab} />{tab === "summary" && <MoneyView />}{tab === "purchases" && <FinanceManager data={data} onChanged={onChanged} view="purchases" />}{tab === "expenses" && <FinanceManager data={data} onChanged={onChanged} view="expenses" />}</div>;
}
