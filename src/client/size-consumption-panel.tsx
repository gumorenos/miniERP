import React, { useEffect, useMemo, useState } from "react";
import type { Bootstrap } from "./api";
import { operationsApi, type SizeConsumptionRow } from "./operations-api";

const sizes = ["S", "M", "L", "XL", "XXL"] as const;

export function SizeConsumptionPanel({ data }: { data: Bootstrap }) {
  const products = data.products.filter((product) => Boolean(product.defaultFabricMaterialId));
  const [rows, setRows] = useState<SizeConsumptionRow[]>([]);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const product = useMemo(() => products.find((item) => item.id === productId), [products, productId]);

  const load = async () => { const result = await operationsApi.sizeConsumption(); setRows(result.rows); };
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar consumos.")); }, []);
  useEffect(() => {
    if (!productId && products[0]) setProductId(products[0].id);
    const next: Record<string, string> = {};
    for (const size of sizes) {
      const override = rows.find((row) => row.productId === productId && row.size === size)?.fabricQtyMeters;
      next[size] = override == null ? "" : String(override);
    }
    setValues(next);
  }, [productId, rows, products]);

  if (!products.length) return <section><h2>Consumo por talla</h2><p className="muted">Asigna una tela habitual a un producto para configurar consumos por talla.</p></section>;

  return <section><h2>Consumo de tela por talla</h2><p className="muted">Deja una talla vacía para usar el consumo estándar del producto.</p>
    <label>Producto<select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {product && <p className="muted">Consumo estándar: {product.defaultFabricQtyMeters ?? "-"} m</p>}
    <form className="form" onSubmit={async (event) => {
      event.preventDefault(); setError(""); setMessage("");
      try {
        const quantities = Object.fromEntries(sizes.map((size) => [size, values[size]?.trim() ? Number(values[size]) : null]));
        const result = await operationsApi.saveSizeConsumption(productId, quantities);
        setRows(result.rows); setMessage("Consumos por talla actualizados.");
      } catch (err) { setError(err instanceof Error ? err.message : "No se pudieron guardar los consumos."); }
    }}>
      <div className="size-grid">{sizes.map((size) => <label key={size}>{size}<input type="number" min="0.01" step="0.01" placeholder={String(product?.defaultFabricQtyMeters ?? "Estándar")} value={values[size] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [size]: event.target.value }))} /></label>)}</div>
      {error && <p className="error" role="alert">{error}</p>}{message && <p className="login-success" role="status">{message}</p>}
      <button type="submit">Guardar consumos</button>
    </form>
  </section>;
}
