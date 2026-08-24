import React, { useEffect, useMemo, useRef, useState } from "react";
import { captureFollowUpPrompt, captureIntentLabel } from "../domain/capture";
import { captureApi, type CaptureDraft } from "./capture-api";
import type { Bootstrap, Customer, OrderDetail, Product } from "./api";

const sizes = ["S", "M", "L", "XL", "XXL"] as const;
const methods = [["YAPE", "Yape"], ["PLIN", "Plin"], ["CASH", "Efectivo"], ["BANK_TRANSFER", "Transferencia"], ["OTHER", "Otro"]] as const;
const expenseCategories = [["EMBROIDERY", "Bordado"], ["TRANSPORT", "Transporte"], ["PACKAGING", "Empaque"], ["TOOLS", "Herramientas"], ["SERVICES", "Servicios"], ["MARKETING", "Marketing"], ["OTHER", "Otro"]] as const;

const fieldLabels: Record<string, string> = {
  customer: "cliente",
  product: "producto",
  size: "talla",
  color: "color",
  promisedDeliveryDate: "fecha de entrega",
  name: "nombre",
  material: "material",
  quantity: "cantidad",
  amount: "importe",
  description: "motivo o descripción",
  supplier: "proveedor"
};

function money(value: number | undefined) {
  return "S/ " + Number(value ?? 0).toFixed(2);
}

export function CaptureView({ data, onCancel, onChanged, onCreated }: {
  data: Bootstrap;
  onCancel: () => void;
  onChanged: () => Promise<void>;
  onCreated: (order: OrderDetail) => Promise<void> | void;
}) {
  const [message, setMessage] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [recentDrafts, setRecentDrafts] = useState<CaptureDraft[]>([]);
  const [conversationKey, setConversationKey] = useState(() => newConversationKey());
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [size, setSize] = useState<"" | (typeof sizes)[number]>("");
  const [color, setColor] = useState("");
  const [price, setPrice] = useState("");
  const [advance, setAdvance] = useState("0");
  const [method, setMethod] = useState("YAPE");
  const [delivery, setDelivery] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [operationDate, setOperationDate] = useState("");
  const [operationQuantity, setOperationQuantity] = useState("");
  const [operationAmount, setOperationAmount] = useState("");
  const [operationUnitCost, setOperationUnitCost] = useState("");
  const [operationPaymentMethod, setOperationPaymentMethod] = useState("YAPE");
  const [operationCategory, setOperationCategory] = useState("OTHER");
  const [operationDescription, setOperationDescription] = useState("");
  const [operationOrderId, setOperationOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pendingSourceMessageId = useRef<string | null>(null);

  const messageSourceId = () => {
    if (!pendingSourceMessageId.current) pendingSourceMessageId.current = "internal:" + newConversationKey();
    return pendingSourceMessageId.current;
  };

  const product = useMemo(() => data.products.find((item) => item.id === productId), [data.products, productId]);
  const parsedMissing = draft?.missingFields.map((field) => fieldLabels[field] ?? field) ?? [];
  const parsedAmbiguous = draft?.ambiguousFields.map((field) => fieldLabels[field] ?? field) ?? [];

  const hydrateDraft = (next: CaptureDraft) => {
    setDraft(next);
    if (next.conversationKey) setConversationKey(next.conversationKey);
    setCustomerId(next.payload.customerId ?? "");
    setProductId(next.payload.productId ?? "");
    setSize(next.payload.size && sizes.includes(next.payload.size) ? next.payload.size : "");
    setColor(next.payload.color ?? "");
    setPrice(next.payload.agreedTotalPrice == null ? "" : String(next.payload.agreedTotalPrice));
    setAdvance(String(next.payload.advanceAmount ?? 0));
    setMethod(next.payload.advanceMethod ?? "YAPE");
    setDelivery(next.payload.promisedDeliveryDate ?? "");
    setCustomerName(next.payload.name ?? next.payload.customerName ?? "");
    setCustomerPhone(next.payload.phone ?? next.payload.customerPhone ?? "");
    setMaterialId(next.payload.materialId ?? "");
    setSupplierId(next.payload.supplierId ?? "");
    setOperationDate(next.payload.operationDate ?? "");
    setOperationQuantity(next.payload.quantity == null ? "" : String(next.payload.quantity));
    setOperationAmount(next.payload.amount == null ? "" : String(next.payload.amount));
    setOperationUnitCost(next.payload.unitCost == null ? "" : String(next.payload.unitCost));
    setOperationPaymentMethod(next.payload.paymentMethod ?? "YAPE");
    setOperationCategory(next.payload.category ?? "OTHER");
    setOperationDescription(next.payload.description ?? "");
    setOperationOrderId(next.payload.orderId ?? "");
  };

  useEffect(() => {
    captureApi.listDrafts().then((result) => setRecentDrafts(result.rows.filter((item) => item.status === "PENDING"))).catch(() => undefined);
  }, []);

  const analyze = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(""); setSuccess(""); setBusy(true);
    try {
      const result = await captureApi.createDraft({
        rawText: message,
        conversationKey,
        sourceMessageId: messageSourceId()
      });
      hydrateDraft(result.draft);
      pendingSourceMessageId.current = null;
      setRecentDrafts((current) => [result.draft, ...current.filter((item) => item.id !== result.draft.id)].slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo analizar el mensaje.");
    } finally { setBusy(false); }
  };

  const continueConversation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || followUpMessage.trim().length < 2) return;
    setError(""); setSuccess(""); setBusy(true);
    try {
      const result = await captureApi.createDraft({
        rawText: followUpMessage,
        conversationKey: draft.conversationKey ?? conversationKey,
        sourceMessageId: messageSourceId()
      });
      hydrateDraft(result.draft);
      pendingSourceMessageId.current = null;
      setFollowUpMessage("");
      setRecentDrafts((current) => [result.draft, ...current.filter((item) => item.id !== result.draft.id)].slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar el borrador.");
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!draft) return;
    setError(""); setSuccess(""); setBusy(true);
    try {
      const payload = draft.intent === "NEW_ORDER" ? {
        ...draft.payload,
        customerId: customerId || undefined,
        productId: productId || undefined,
        size: size || undefined,
        color: color.trim(),
        agreedTotalPrice: price ? Number(price) : undefined,
        advanceAmount: Number(advance || 0),
        advanceMethod: method as "YAPE" | "PLIN" | "CASH" | "BANK_TRANSFER" | "OTHER",
        promisedDeliveryDate: delivery || null
      } : draft.intent === "NEW_CUSTOMER" ? {
        ...draft.payload,
        name: customerName.trim(),
        phone: customerPhone.trim() || undefined
      } : draft.intent === "NEW_PURCHASE" ? {
        ...draft.payload,
        materialId: materialId || undefined,
        supplierId: supplierId || undefined,
        quantity: operationQuantity ? Number(operationQuantity) : undefined,
        amount: operationAmount ? Number(operationAmount) : undefined,
        unitCost: operationUnitCost ? Number(operationUnitCost) : undefined,
        operationDate: operationDate || null,
        paymentMethod: operationPaymentMethod as "YAPE" | "PLIN" | "CASH" | "BANK_TRANSFER" | "OTHER",
        description: operationDescription.trim()
      } : draft.intent === "NEW_EXPENSE" ? {
        ...draft.payload,
        amount: operationAmount ? Number(operationAmount) : undefined,
        operationDate: operationDate || null,
        category: operationCategory,
        paymentMethod: operationPaymentMethod as "YAPE" | "PLIN" | "CASH" | "BANK_TRANSFER" | "OTHER",
        description: operationDescription.trim(),
        orderId: operationOrderId || null
      } : {
        ...draft.payload,
        materialId: materialId || undefined,
        quantity: operationQuantity ? Number(operationQuantity) : undefined,
        unitCost: operationUnitCost ? Number(operationUnitCost) : undefined,
        operationDate: operationDate || null,
        description: operationDescription.trim()
      };
      const result = await captureApi.confirmDraft(draft.id, payload);
      if (result.order) {
        await onChanged();
        const order = await fetchOrder(result.order.id);
        await onCreated(order);
      } else {
        setSuccess(result.customer ? "Cliente creado. Ya puedes continuar con el siguiente registro." : "Operación registrada. Ya puedes continuar con el siguiente registro.");
        await onChanged();
        setDraft(null);
        setRecentDrafts((current) => current.filter((item) => item.id !== draft.id));
        setMessage(""); setFollowUpMessage(""); setConversationKey(newConversationKey());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el borrador.");
    } finally { setBusy(false); }
  };

  const reject = async () => {
    if (!draft) return;
    setError(""); setBusy(true);
    try {
      await captureApi.rejectDraft(draft.id);
      setDraft(null); setRecentDrafts((current) => current.filter((item) => item.id !== draft.id)); setMessage(""); setFollowUpMessage(""); setConversationKey(newConversationKey()); setSuccess("Borrador descartado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descartar el borrador.");
    } finally { setBusy(false); }
  };

  return <div className="stack">
    <section className="module-intro">
      <div className="section-heading">
        <div><p className="eyebrow">Menos data entry · rules-v1</p><h2>Capturar por chat</h2><p className="muted">Escribe como lo dirías por WhatsApp. Primero revisamos; después guardamos.</p></div>
        <button type="button" className="ghost" onClick={onCancel}>Volver</button>
      </div>
      <form className="capture-message-form" onSubmit={analyze}>
        <label>Mensaje del pedido, compra, gasto o ajuste
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} placeholder="María quiere vestido Margarita azul talla M, dejó 100 por Yape y lo quiere para el 8." required />
        </label>
        <div className="capture-footer"><p className="helper">La versión inicial usa reglas auditables; la IA se podrá conectar después como otro intérprete.</p><button disabled={busy || message.trim().length < 2}>{busy ? "Analizando..." : "Analizar mensaje"}</button></div>
      </form>
      {success && <p className="success" role="status">{success}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>

    {!draft && recentDrafts.length > 0 && <section><div className="section-heading"><div><p className="eyebrow">Bandeja de captura</p><h2>Borradores pendientes</h2><p className="muted">Puedes retomarlos sin volver a pegar el mensaje.</p></div></div><div className="list">{recentDrafts.map((item) => <button type="button" className="row" key={item.id} onClick={() => { setSuccess(""); setError(""); setMessage(item.rawText); hydrateDraft(item); }}><span><strong>{captureIntentLabel(item.intent)}</strong><small>{item.rawText}</small></span><span><b>Revisar</b></span></button>)}</div></section>}

    {draft && <section className="capture-draft">
      <div className="section-heading"><div><p className="eyebrow">Borrador {draft.parserVersion}</p><h2>{captureIntentLabel(draft.intent)}</h2><p className="muted">Confianza: {draft.ambiguousFields.length ? "baja" : draft.missingFields.length ? "media" : "alta"}</p></div><span className={"capture-status " + draft.status.toLowerCase()}>{draft.status === "PENDING" ? "Pendiente de confirmar" : draft.status}</span></div>
      <blockquote className="capture-quote">{draft.rawText}</blockquote>
      {parsedMissing.length > 0 && <p className="warning">Falta completar: {parsedMissing.join(", ")}.</p>}
      {parsedAmbiguous.length > 0 && <p className="warning">Revisa porque puede haber ambigüedad en: {parsedAmbiguous.join(", ")}.</p>}

      {(draft.missingFields.length > 0 || draft.ambiguousFields.length > 0) && <form className="capture-follow-up" onSubmit={continueConversation}>
        <label>Continuar por chat
          <textarea value={followUpMessage} onChange={(event) => setFollowUpMessage(event.target.value)} rows={3} placeholder={captureFollowUpPrompt(draft) ?? "Completa el dato faltante."} />
        </label>
        <div className="capture-footer"><p className="helper">La respuesta se añadirá al mismo borrador; todavía no se guarda ninguna operación.</p><button disabled={busy || followUpMessage.trim().length < 2}>{busy ? "Completando..." : "Completar borrador"}</button></div>
      </form>}

      {draft.intent === "NEW_ORDER" && <OrderDraftFields data={data} draft={draft} customerId={customerId} setCustomerId={setCustomerId} productId={productId} setProductId={setProductId} size={size} setSize={setSize} color={color} setColor={setColor} price={price} setPrice={setPrice} advance={advance} setAdvance={setAdvance} method={method} setMethod={setMethod} delivery={delivery} setDelivery={setDelivery} product={product} />}
      {draft.intent === "NEW_CUSTOMER" && <div className="capture-grid"><label>Nombre *<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label><label>Teléfono<input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></label></div>}
      {draft.intent === "NEW_PURCHASE" && <OperationalDraftFields intent="NEW_PURCHASE" data={data} materialId={materialId} setMaterialId={setMaterialId} supplierId={supplierId} setSupplierId={setSupplierId} operationDate={operationDate} setOperationDate={setOperationDate} quantity={operationQuantity} setQuantity={setOperationQuantity} amount={operationAmount} setAmount={setOperationAmount} unitCost={operationUnitCost} setUnitCost={setOperationUnitCost} paymentMethod={operationPaymentMethod} setPaymentMethod={setOperationPaymentMethod} category={operationCategory} setCategory={setOperationCategory} description={operationDescription} setDescription={setOperationDescription} orderId={operationOrderId} setOrderId={setOperationOrderId} />}\n      {draft.intent === "NEW_EXPENSE" && <OperationalDraftFields intent="NEW_EXPENSE" data={data} materialId={materialId} setMaterialId={setMaterialId} supplierId={supplierId} setSupplierId={setSupplierId} operationDate={operationDate} setOperationDate={setOperationDate} quantity={operationQuantity} setQuantity={setOperationQuantity} amount={operationAmount} setAmount={setOperationAmount} unitCost={operationUnitCost} setUnitCost={setOperationUnitCost} paymentMethod={operationPaymentMethod} setPaymentMethod={setOperationPaymentMethod} category={operationCategory} setCategory={setOperationCategory} description={operationDescription} setDescription={setOperationDescription} orderId={operationOrderId} setOrderId={setOperationOrderId} />}\n      {draft.intent === "STOCK_ADJUSTMENT" && <OperationalDraftFields intent="STOCK_ADJUSTMENT" data={data} materialId={materialId} setMaterialId={setMaterialId} supplierId={supplierId} setSupplierId={setSupplierId} operationDate={operationDate} setOperationDate={setOperationDate} quantity={operationQuantity} setQuantity={setOperationQuantity} amount={operationAmount} setAmount={setOperationAmount} unitCost={operationUnitCost} setUnitCost={setOperationUnitCost} paymentMethod={operationPaymentMethod} setPaymentMethod={setOperationPaymentMethod} category={operationCategory} setCategory={setOperationCategory} description={operationDescription} setDescription={setOperationDescription} orderId={operationOrderId} setOrderId={setOperationOrderId} />}\n      {draft.intent === "UNKNOWN" && <p className="muted">No pude identificar una operación segura. Prueba indicando pedido, compra, gasto o ajuste de stock.</p>}
      <div className="capture-footer"><p className="helper">Nada se guarda en el negocio hasta confirmar.</p><div className="actions capture-actions"><button type="button" className="ghost danger" onClick={reject} disabled={busy}>Descartar</button>{draft.intent !== "UNKNOWN" && <button type="button" onClick={confirm} disabled={busy || !draftReady(draft.intent, { customerId, productId, size, color, customerName, materialId, operationQuantity, operationAmount, operationUnitCost, operationDescription })}>{busy ? "Guardando..." : "Confirmar y guardar"}</button>}</div></div>
    </section>}
  </div>;
}

function draftReady(intent: CaptureDraft["intent"], fields: { customerId: string; productId: string; size: string; color: string; customerName: string; materialId: string; operationQuantity: string; operationAmount: string; operationUnitCost: string; operationDescription: string }) {
  if (intent === "NEW_ORDER") return Boolean(fields.customerId && fields.productId && fields.size && fields.color.trim());
  if (intent === "NEW_CUSTOMER") return fields.customerName.trim().length >= 2;
  if (intent === "NEW_PURCHASE") return Boolean(fields.materialId && Number(fields.operationQuantity) > 0 && (Number(fields.operationAmount) > 0 || Number(fields.operationUnitCost) > 0));
  if (intent === "NEW_EXPENSE") return Boolean(Number(fields.operationAmount) > 0 && fields.operationDescription.trim().length >= 2);
  if (intent === "STOCK_ADJUSTMENT") return Boolean(fields.materialId && Math.abs(Number(fields.operationQuantity)) > 0.0001 && fields.operationDescription.trim().length >= 2);
  return false;
}

function newConversationKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return "internal:" + random;
}

function OperationalDraftFields({ intent, data, materialId, setMaterialId, supplierId, setSupplierId, operationDate, setOperationDate, quantity, setQuantity, amount, setAmount, unitCost, setUnitCost, paymentMethod, setPaymentMethod, category, setCategory, description, setDescription, orderId, setOrderId }: {
  intent: "NEW_PURCHASE" | "NEW_EXPENSE" | "STOCK_ADJUSTMENT";
  data: Bootstrap;
  materialId: string;
  setMaterialId: (value: string) => void;
  supplierId: string;
  setSupplierId: (value: string) => void;
  operationDate: string;
  setOperationDate: (value: string) => void;
  quantity: string;
  setQuantity: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  unitCost: string;
  setUnitCost: (value: string) => void;
  paymentMethod: string;
  setPaymentMethod: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  orderId: string;
  setOrderId: (value: string) => void;
}) {
  return <div className="capture-grid">
    {intent !== "NEW_EXPENSE" && <label>Material *<select value={materialId} onChange={(event) => setMaterialId(event.target.value)}><option value="">Selecciona...</option>{data.materials.map((item) => <option key={item.id} value={item.id}>{item.name}{item.color ? " · " + item.color : ""}</option>)}</select></label>}
    {intent === "NEW_PURCHASE" && <>
      <label>Fecha de compra<input type="date" value={operationDate} onChange={(event) => setOperationDate(event.target.value)} /></label>
      <label>Proveedor<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Sin proveedor</option>{data.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Cantidad *<input type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      <label>Costo total *<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>Costo unitario opcional<input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label>
      <label>Método<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Notas<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    </>}
    {intent === "NEW_EXPENSE" && <>
      <label>Fecha del gasto<input type="date" value={operationDate} onChange={(event) => setOperationDate(event.target.value)} /></label>
      <label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}>{expenseCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Descripción *<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>Importe *<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>Método<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Pedido asociado opcional<select value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">Ninguno</option>{data.orders.map((item) => <option key={item.id} value={item.id}>{item.orderNumber} · {item.customerName}</option>)}</select></label>
    </>}
    {intent === "STOCK_ADJUSTMENT" && <>
      <label>Cantidad (+ entrada / − salida) *<input type="number" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      <label>Costo unitario opcional<input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label>
      <label>Motivo *<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    </>}
  </div>;
}

function OrderDraftFields({ data, draft, customerId, setCustomerId, productId, setProductId, size, setSize, color, setColor, price, setPrice, advance, setAdvance, method, setMethod, delivery, setDelivery, product }: {
  data: Bootstrap;
  draft: CaptureDraft;
  customerId: string;
  setCustomerId: (value: string) => void;
  productId: string;
  setProductId: (value: string) => void;
  size: "" | (typeof sizes)[number];
  setSize: (value: "" | (typeof sizes)[number]) => void;
  color: string;
  setColor: (value: string) => void;
  price: string;
  setPrice: (value: string) => void;
  advance: string;
  setAdvance: (value: string) => void;
  method: string;
  setMethod: (value: string) => void;
  delivery: string;
  setDelivery: (value: string) => void;
  product?: Product;
}) {
  const priceRow = product?.sizePrices.find((row) => row.size === size);
  const suggested = product ? Number(priceRow?.fixedPrice ?? product.baseSalePrice) + Number(priceRow?.priceAdjustment ?? 0) : 0;
  return <div className="capture-grid">
    <label>Cliente *<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Selecciona...</option>{data.customers.map((customer: Customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><span className="field-hint">{draft.payload.customerName ? "Detectado: " + draft.payload.customerName : "No detectado"}</span></label>
    <label>Producto *<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Selecciona...</option>{data.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="field-hint">{draft.payload.productName ? "Detectado: " + draft.payload.productName : "No detectado"}</span></label>
    <label>Talla *<select value={size} onChange={(event) => setSize(event.target.value as "" | (typeof sizes)[number])}><option value="">Selecciona...</option>{sizes.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label>Color *<input value={color} onChange={(event) => setColor(event.target.value)} /></label>
    <label>Precio *<input type="number" min="0.01" step="0.01" value={price} placeholder={suggested ? money(suggested) : ""} onChange={(event) => setPrice(event.target.value)} /><span className="field-hint">{suggested ? "Sugerido: " + money(suggested) : "Selecciona un producto"}</span></label>
    <label>Adelanto<input type="number" min="0" step="0.01" value={advance} onChange={(event) => setAdvance(event.target.value)} /></label>
    <label>Método del adelanto<select value={method} onChange={(event) => setMethod(event.target.value)}>{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Entrega prometida<input type="date" value={delivery} onChange={(event) => setDelivery(event.target.value)} /><span className="field-hint">{draft.payload.deliveryText ? "Detectado: " + draft.payload.deliveryText : "Opcional; puedes completarla"}</span></label>
  </div>;
}

async function fetchOrder(id: string): Promise<OrderDetail> {
  const response = await fetch("/api/orders/" + id, { credentials: "same-origin" });
  if (!response.ok) throw new Error("El pedido fue creado, pero no se pudo abrir su detalle.");
  return response.json() as Promise<OrderDetail>;
}
