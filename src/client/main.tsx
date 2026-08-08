import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { api, clearToken, getToken, setToken, type Bootstrap, type Customer, type OrderDetail } from "./api";

const statusLabels: Record<string, string> = {
  ORDER_RECEIVED: "Recibido",
  MATERIAL_PENDING: "Material",
  READY_TO_CUT: "Listo corte",
  CUT: "Cortado",
  AT_EMBROIDERER: "Bordador",
  EMBROIDERY_RECEIVED: "Bordado recibido",
  ASSEMBLY: "Confeccion",
  READY_FOR_DELIVERY: "Listo entrega",
  DELIVERED: "Entregado",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado"
};

const fmt = (value: number | string | null | undefined) => `S/ ${Number(value ?? 0).toFixed(2)}`;

function App() {
  const [token, setSessionToken] = useState(getToken());
  const [data, setData] = useState<Bootstrap | null>(null);
  const [screen, setScreen] = useState("dashboard");
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const next = await api.bootstrap();
    setData(next);
    if (selectedOrder) setSelectedOrder(await api.getOrder(selectedOrder.id));
  };

  useEffect(() => {
    if (token) reload().catch((err) => setError(err.message));
  }, [token]);

  if (!token) {
    return (
      <Login
        onLogin={(nextToken) => {
          setToken(nextToken);
          setSessionToken(nextToken);
        }}
      />
    );
  }

  if (!data) return <Shell error={error} onLogout={() => logout(setSessionToken)}><p>Cargando...</p></Shell>;

  return (
    <Shell data={data} error={error} onLogout={() => logout(setSessionToken)} screen={screen} setScreen={setScreen}>
      {screen === "dashboard" && <Dashboard data={data} />}
      {screen === "orders" && <Orders data={data} onOpen={async (id) => { setSelectedOrder(await api.getOrder(id)); setScreen("orderDetail"); }} />}
      {screen === "newOrder" && <NewOrder data={data} onCreated={async (order) => { await reload(); setSelectedOrder(order); setScreen("orderDetail"); }} />}
      {screen === "orderDetail" && selectedOrder && <OrderDetailView order={selectedOrder} data={data} onReload={async () => { const order = await api.getOrder(selectedOrder.id); setSelectedOrder(order); await reload(); }} />}
      {screen === "customers" && <Customers data={data} onCreated={reload} />}
      {screen === "products" && <Products data={data} />}
      {screen === "inventory" && <Inventory data={data} />}
    </Shell>
  );
}

function logout(setSessionToken: (value: string | null) => void) {
  clearToken();
  setSessionToken(null);
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("admin@example.test");
  const [password, setPassword] = useState("change-me-dev");
  const [error, setError] = useState("");
  return (
    <main className="login">
      <section className="login-panel">
        <p className="eyebrow">miniERP</p>
        <h1>Operacion del taller</h1>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              const result = await api.login(email, password);
              onLogin(result.token);
            } catch (err) {
              setError(err instanceof Error ? err.message : "No se pudo entrar");
            }
          }}
        >
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <p className="error">{error}</p>}
          <button>Entrar</button>
        </form>
      </section>
    </main>
  );
}

function Shell({ children, data, error, onLogout, screen, setScreen }: { children: React.ReactNode; data?: Bootstrap; error?: string | null; onLogout: () => void; screen?: string; setScreen?: (screen: string) => void }) {
  const tabs = [
    ["dashboard", "Dashboard"],
    ["orders", "Pedidos"],
    ["newOrder", "Nuevo"],
    ["customers", "Clientes"],
    ["products", "Productos"],
    ["inventory", "Inventario"]
  ];
  return (
    <div className="app-shell">
      <header>
        <div>
          <p className="eyebrow">{data?.business.name ?? "miniERP"}</p>
          <h1>{screen === "newOrder" ? "Nuevo pedido" : "Taller"}</h1>
        </div>
        <button className="ghost" onClick={onLogout}>Salir</button>
      </header>
      {data?.demo && <div className="demo-banner">Datos demo de desarrollo. Editables; no son reglas de negocio.</div>}
      {error && <p className="error">{error}</p>}
      {setScreen && <nav>{tabs.map(([id, label]) => <button className={screen === id ? "active" : ""} key={id} onClick={() => setScreen(id)}>{label}</button>)}</nav>}
      <main>{children}</main>
    </div>
  );
}

function Dashboard({ data }: { data: Bootstrap }) {
  return (
    <div className="stack">
      <section className="metrics">
        <Metric label="Activos" value={data.dashboard.activeOrders} />
        <Metric label="Bordador" value={data.dashboard.atEmbroidery} />
        <Metric label="Por cobrar" value={fmt(data.dashboard.money.receivable)} />
        <Metric label="Margen ref." value={fmt(data.dashboard.money.margin)} />
      </section>
      <section>
        <h2>Urgente</h2>
        <List rows={[...data.dashboard.lateOrders, ...data.dashboard.dueSoon].slice(0, 5)} empty="Sin pedidos urgentes" />
        {data.dashboard.lateEmbroideryJobs.length > 0 && <p className="warning">Hay {data.dashboard.lateEmbroideryJobs.length} bordado(s) atrasado(s).</p>}
      </section>
      <section>
        <h2>Dinero</h2>
        <div className="money-grid">
          <span>Ventas acordadas</span><strong>{fmt(data.dashboard.money.sales)}</strong>
          <span>Cobrado</span><strong>{fmt(data.dashboard.money.collected)}</strong>
          <span>Por cobrar</span><strong>{fmt(data.dashboard.money.receivable)}</strong>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Orders({ data, onOpen }: { data: Bootstrap; onOpen: (id: string) => void }) {
  return <section><h2>Pedidos</h2><List rows={data.orders} onOpen={onOpen} empty="Sin pedidos todavia" /></section>;
}

function List({ rows, onOpen, empty }: { rows: Array<{ id: string; orderNumber: string; customerName?: string; status: string; agreedTotalPrice?: string; promisedDeliveryDate?: string | null }>; onOpen?: (id: string) => void; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <div className="list">
      {rows.map((row) => (
        <button key={row.id} className="row" onClick={() => onOpen?.(row.id)}>
          <span><strong>{row.orderNumber}</strong>{row.customerName && <small>{row.customerName}</small>}</span>
          <span><b>{statusLabels[row.status] ?? row.status}</b>{row.agreedTotalPrice && <small>{fmt(row.agreedTotalPrice)}</small>}</span>
        </button>
      ))}
    </div>
  );
}

function NewOrder({ data, onCreated }: { data: Bootstrap; onCreated: (order: OrderDetail) => void }) {
  const product = data.products[0];
  const [customerId, setCustomerId] = useState(data.customers[0]?.id ?? "");
  const [productId, setProductId] = useState(product?.id ?? "");
  const selectedProduct = data.products.find((item) => item.id === productId) ?? product;
  const [size, setSize] = useState("S");
  const [color, setColor] = useState("Negro");
  const price = useMemo(() => {
    const sizeRow = selectedProduct?.sizePrices.find((row) => row.size === size);
    return Number(sizeRow?.fixedPrice ?? selectedProduct?.baseSalePrice ?? 0) + Number(sizeRow?.priceAdjustment ?? 0);
  }, [selectedProduct, size]);
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState("");
  const [error, setError] = useState("");
  return (
    <section>
      <h2>Nuevo pedido</h2>
      {!data.customers.length && <p className="warning">Crea un cliente primero.</p>}
      <form className="form" onSubmit={async (event) => { event.preventDefault(); setError(""); try { onCreated(await api.createOrder({ customerId, productId, size, color, quantity: 1, agreedTotalPrice: price, promisedDeliveryDate: promisedDeliveryDate || null })); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear"); } }}>
        <label>Cliente<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label>Producto<select value={productId} onChange={(event) => setProductId(event.target.value)}>{data.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Talla<select value={size} onChange={(event) => setSize(event.target.value)}>{["S", "M", "L", "XL", "XXL"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Color<input value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <label>Fecha prometida<input type="date" value={promisedDeliveryDate} onChange={(event) => setPromisedDeliveryDate(event.target.value)} /></label>
        <p className="price">Precio configurable: {fmt(price)}</p>
        {error && <p className="error">{error}</p>}
        <button disabled={!customerId || !productId}>Crear pedido</button>
      </form>
    </section>
  );
}

function OrderDetailView({ order, data, onReload }: { order: OrderDetail; data: Bootstrap; onReload: () => Promise<void> }) {
  const [payment, setPayment] = useState(order.financials.balance > 0 ? Math.min(100, order.financials.balance) : 0);
  const [method, setMethod] = useState("YAPE");
  const provider = data.providers[0];
  const nextActions = [
    ["MATERIAL_PENDING", "Material pendiente"],
    ["READY_TO_CUT", "Listo para corte"],
    ["ASSEMBLY", "Confeccion"],
    ["READY_FOR_DELIVERY", "Listo para entregar"],
    ["DELIVERED", "Entregar"],
    ["CLOSED", "Cerrar"]
  ];
  return (
    <div className="stack">
      <section>
        <h2>{order.orderNumber}</h2>
        <p className="muted">{order.customer?.name} · {statusLabels[order.status] ?? order.status}</p>
        <div className="metrics">
          <Metric label="Precio" value={fmt(order.financials.agreedTotalPrice)} />
          <Metric label="Pagado" value={fmt(order.financials.totalPaid)} />
          <Metric label="Saldo" value={fmt(order.financials.balance)} />
          <Metric label="Margen" value={fmt(order.financials.margin)} />
        </div>
        <div className="money-grid">
          <span>Costo estimado</span><strong>{fmt(order.financials.estimatedCost)}</strong>
          <span>Costo real</span><strong>{fmt(order.financials.actualCost)}</strong>
          <span>Costo margen</span><strong>{fmt(order.financials.costForMargin)}</strong>
        </div>
      </section>
      <section>
        <h2>Flujo</h2>
        <div className="actions">
          <button onClick={async () => { await api.cut(order.id); await onReload(); }}>Cortar y descontar tela</button>
          {provider && <button onClick={async () => { const expected = new Date(); expected.setDate(expected.getDate() + 14); await api.sendEmbroidery(order.id, { providerId: provider.id, expectedReturnDate: expected.toISOString().slice(0, 10), estimatedCost: 80 }); await onReload(); }}>Enviar bordado</button>}
          {order.embroideryJobs.find((job) => job.status === "SENT") && <button onClick={async () => { const job = order.embroideryJobs.find((item) => item.status === "SENT"); if (job) await api.receiveEmbroidery(order.id, job.id, 80); await onReload(); }}>Recibir bordado</button>}
          {nextActions.map(([status, label]) => <button className="secondary" key={status} onClick={async () => { await api.transition(order.id, status); await onReload(); }}>{label}</button>)}
        </div>
      </section>
      <section>
        <h2>Pagos</h2>
        <form className="inline" onSubmit={async (event) => { event.preventDefault(); await api.pay(order.id, { amount: payment, method }); await onReload(); }}>
          <input type="number" min="0" step="0.01" value={payment} onChange={(event) => setPayment(Number(event.target.value))} />
          <select value={method} onChange={(event) => setMethod(event.target.value)}><option value="YAPE">Yape</option><option value="PLIN">Plin</option><option value="CASH">Efectivo</option><option value="BANK_TRANSFER">Transferencia</option><option value="OTHER">Otro</option></select>
          <button>Registrar</button>
        </form>
        <div className="list">{order.payments.map((item) => <div className="row static" key={item.id}><span>{item.method}<small>{new Date(item.paidAt).toLocaleDateString()}</small></span><strong>{fmt(item.amount)}</strong></div>)}</div>
      </section>
      <section>
        <h2>Bordado</h2>
        {order.embroideryJobs.length ? order.embroideryJobs.map((job) => <p className={job.overdueDays > 0 ? "warning" : "muted"} key={job.id}>{job.status} · retorno {job.expectedReturnDate ?? "-"} · atraso {job.overdueDays} dias</p>) : <p className="muted">Sin bordado registrado.</p>}
      </section>
    </div>
  );
}

function Customers({ data, onCreated }: { data: Bootstrap; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  return (
    <section>
      <h2>Clientes</h2>
      <form className="inline" onSubmit={async (event) => { event.preventDefault(); await api.createCustomer({ name }); setName(""); await onCreated(); }}>
        <input placeholder="Nombre" value={name} onChange={(event) => setName(event.target.value)} />
        <button>Crear</button>
      </form>
      <div className="list">{data.customers.map((customer: Customer) => <div className="row static" key={customer.id}><span><strong>{customer.name}</strong><small>{customer.phone ?? customer.instagramHandle ?? "Sin contacto"}</small></span></div>)}</div>
    </section>
  );
}

function Products({ data }: { data: Bootstrap }) {
  return <section><h2>Productos</h2><div className="list">{data.products.map((product) => <div className="row static" key={product.id}><span><strong>{product.name}</strong><small>{product.type} · tela {product.defaultFabricQtyMeters ?? "-"} m · bordado {fmt(product.defaultEmbroideryCost)}</small></span><strong>{fmt(product.baseSalePrice)}</strong></div>)}</div></section>;
}

function Inventory({ data }: { data: Bootstrap }) {
  return <section><h2>Inventario</h2><div className="list">{data.materials.map((material) => <div className="row static" key={material.id}><span><strong>{material.name}</strong><small>{material.category} · {material.color ?? "sin color"}</small></span><strong>{material.currentQuantity} {material.unit}</strong></div>)}</div></section>;
}

createRoot(document.getElementById("root")!).render(<App />);

