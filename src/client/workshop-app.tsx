import React, { useEffect, useState } from "react";
import { api, type Bootstrap, type OrderDetail } from "./api";
import { workshopApi } from "./workshop-api";
import { filterBootstrap, filterOrderDetail } from "./archive-filter";
import { WorkshopShell } from "./workshop-shell";
import { DashboardView, OrdersView } from "./workshop-overview";
import { CustomerManager } from "./customer-manager";
import { ProductsManager } from "./products-manager";
import { InventoryManager } from "./inventory-manager";
import { NewOrderForm } from "./new-order-form";
import { OrderDetailView } from "./order-detail-view";
import { SizeConsumptionPanel } from "./size-consumption-panel";
import { AgendaView } from "./agenda-view";
import { FinanceManager } from "./finance-manager";
import { MoneyView } from "./money-view";
import { ProvidersManager } from "./providers-manager";

export function WorkshopApp() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [screen, setScreen] = useState("dashboard");
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadActiveData = async () => {
    const [next, archived] = await Promise.all([api.bootstrap(), workshopApi.archived()]);
    setData(filterBootstrap(next, archived.records));
    return archived.records;
  };

  const reload = async (): Promise<void> => { await loadActiveData(); };

  const openOrder = async (id: string) => {
    setError(null);
    try {
      const [order, archived] = await Promise.all([api.getOrder(id), workshopApi.archived()]);
      setSelectedOrder(filterOrderDetail(order, archived.records));
      setScreen("orderDetail");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo abrir el pedido."); }
  };

  const reloadSelectedOrder = async () => {
    if (!selectedOrder) return;
    const [order, archived] = await Promise.all([api.getOrder(selectedOrder.id), workshopApi.archived()]);
    setSelectedOrder(filterOrderDetail(order, archived.records));
    const next = await api.bootstrap();
    setData(filterBootstrap(next, archived.records));
  };

  useEffect(() => { reload().catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el taller.")); }, []);

  if (!data) return <main className="app-shell"><p>{error ?? "Cargando taller..."}</p></main>;

  return <WorkshopShell data={data} screen={screen} setScreen={setScreen} error={error}>
    {screen === "dashboard" && <DashboardView data={data} />}
    {screen === "agenda" && <AgendaView onOpenOrder={openOrder} />}
    {screen === "orders" && <OrdersView rows={data.orders} onOpen={openOrder} />}
    {screen === "newOrder" && <NewOrderForm data={data} onCreated={async (order) => { const archived = await loadActiveData(); setSelectedOrder(filterOrderDetail(order, archived)); setScreen("orderDetail"); }} />}
    {screen === "orderDetail" && selectedOrder && <OrderDetailView order={selectedOrder} data={data} onReload={reloadSelectedOrder} onArchived={async () => { setSelectedOrder(null); setScreen("orders"); await reload(); }} />}
    {screen === "customers" && <CustomerManager data={data} onChanged={reload} onOpenOrder={openOrder} />}
    {screen === "products" && <div className="stack"><ProductsManager data={data} onChanged={reload} /><SizeConsumptionPanel data={data} /></div>}
    {screen === "inventory" && <InventoryManager data={data} onChanged={reload} />}
    {screen === "providers" && <ProvidersManager onChanged={reload} />}
    {screen === "finance" && <FinanceManager data={data} onChanged={reload} />}
    {screen === "money" && <MoneyView />}
  </WorkshopShell>;
}
