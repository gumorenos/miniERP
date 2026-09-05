import { describe, expect, it } from "vitest";
import { parseCaptureMessage } from "./capture";

const catalog = {
  customers: [{ id: "customer-1", name: "María Quispe", phone: "987654321" }],
  products: [{ id: "product-1", name: "Vestido Margarita" }],
  materials: [{ id: "material-1", name: "Tela azul" }],
  suppliers: [{ id: "supplier-1", name: "Textiles Andinos" }]
};

describe("capture parser", () => {
  it("extracts an order from natural Spanish text and resolves catalog names", () => {
    const result = parseCaptureMessage(
      "María Quispe quiere vestido Margarita azul talla M, dejó 100 por Yape y lo quiere para el 8.",
      catalog,
      new Date(2026, 7, 1, 12)
    );

    expect(result.intent).toBe("NEW_ORDER");
    expect(result.payload.customerId).toBe("customer-1");
    expect(result.payload.productId).toBe("product-1");
    expect(result.payload.size).toBe("M");
    expect(result.payload.color).toBe("Azul");
    expect(result.payload.advanceAmount).toBe(100);
    expect(result.payload.advanceMethod).toBe("YAPE");
    expect(result.payload.promisedDeliveryDate).toBe("2026-08-08");
    expect(result.missingFields).toEqual([]);
    expect(result.ambiguousFields).toEqual(["promisedDeliveryDate"]);
  });

  it("identifies a new customer and extracts phone", () => {
    const result = parseCaptureMessage("Crear cliente: Rosa Huamán 987 654 321");
    expect(result.intent).toBe("NEW_CUSTOMER");
    expect(result.payload.name).toBe("Rosa Huamán");
    expect(result.payload.phone).toBe("987654321");
    expect(result.missingFields).toEqual([]);
  });

  it("reports missing fields instead of inventing order data", () => {
    const result = parseCaptureMessage("María quiere un vestido azul");
    expect(result.intent).toBe("NEW_ORDER");
    expect(result.payload.customerName).toBe("María");
    expect(result.payload.color).toBe("Azul");
    expect(result.missingFields).toContain("product");
    expect(result.missingFields).toContain("size");
    expect(result.payload.agreedTotalPrice).toBeUndefined();
  });

  it("keeps unsupported operations as drafts with a clear amount", () => {
    const result = parseCaptureMessage("Gasto de 25 por movilidad pagado en Yape");
    expect(result.intent).toBe("NEW_EXPENSE");
    expect(result.payload.amount).toBe(25);
    expect(result.missingFields).toEqual([]);
  });

  it("extracts a material purchase with supplier and payment method", () => {
    const result = parseCaptureMessage("Compré 5 metros de tela azul por 120, proveedor Textiles Andinos, pagué con Yape", catalog, new Date(2026, 7, 19, 12));
    expect(result.intent).toBe("NEW_PURCHASE");
    expect(result.payload.materialId).toBe("material-1");
    expect(result.payload.quantity).toBe(5);
    expect(result.payload.amount).toBe(120);
    expect(result.payload.supplierId).toBe("supplier-1");
    expect(result.payload.paymentMethod).toBe("YAPE");
    expect(result.missingFields).toEqual([]);
  });

  it("derives a purchase total from quantity and unit cost", () => {
    const result = parseCaptureMessage("Compré 5 metros de tela azul, costo unitario 24, proveedor Textiles Andinos", catalog);
    expect(result.intent).toBe("NEW_PURCHASE");
    expect(result.payload.quantity).toBe(5);
    expect(result.payload.unitCost).toBe(24);
    expect(result.payload.amount).toBe(120);
    expect(result.payload.supplierName).toBe("Textiles Andinos");
    expect(result.missingFields).toEqual([]);
  });

  it("keeps an expense containing a material word as an expense", () => {
    const result = parseCaptureMessage("Gasto de tela para muestra por 25 soles");
    expect(result.intent).toBe("NEW_EXPENSE");
    expect(result.payload.amount).toBe(25);
  });

  it("extracts expense category and leaves it pending for confirmation", () => {
    const result = parseCaptureMessage("Gasto de 25 por movilidad pagado en Yape", catalog);
    expect(result.intent).toBe("NEW_EXPENSE");
    expect(result.payload.category).toBe("TRANSPORT");
    expect(result.payload.paymentMethod).toBe("YAPE");
    expect(result.payload.description).toContain("25");
  });

  it("recognizes a negative stock adjustment explicitly", () => {
    const result = parseCaptureMessage("Ajuste de stock de tela azul -2 metros por merma", catalog);
    expect(result.intent).toBe("STOCK_ADJUSTMENT");
    expect(result.payload.materialId).toBe("material-1");
    expect(result.payload.quantity).toBe(-2);
    expect(result.missingFields).toEqual([]);
  });

  it("parses a follow-up amount using the existing expense context", () => {
    const result = parseCaptureMessage("25 soles", undefined, new Date(), "NEW_EXPENSE");
    expect(result.intent).toBe("NEW_EXPENSE");
    expect(result.payload.amount).toBe(25);
    expect(result.missingFields).toContain("description");
  });

  it("parses a follow-up customer name using the existing customer context", () => {
    const result = parseCaptureMessage("Rosa Huamán", undefined, new Date(), "NEW_CUSTOMER");
    expect(result.intent).toBe("NEW_CUSTOMER");
    expect(result.payload.name).toBe("Rosa Huamán");
  });

  it("parses a standalone size answer from a Telegram follow-up", () => {
    const result = parseCaptureMessage("M", catalog, new Date(), "NEW_ORDER", { completionFields: ["size"] });
    expect(result.payload.size).toBe("M");
    expect(result.missingFields).not.toContain("size");
  });

  it("recognizes a standalone size inside a natural order message", () => {
    const result = parseCaptureMessage("María quiere vestido Margarita azul M", catalog, new Date());
    expect(result.payload.size).toBe("M");
  });

  it("stops the explicit customer name before the order verb", () => {
    const result = parseCaptureMessage("cliente: Ana quiere vestido Sol talla M azul precio 250", catalog, new Date());
    expect(result.payload.customerName).toBe("Ana");
    expect(result.payload.productName).toBe("vestido Sol");
    expect(result.payload.size).toBe("M");
    expect(result.payload.color).toBe("Azul");
    expect(result.payload.agreedTotalPrice).toBe(250);
  });

  it("parses a follow-up product and size using the existing order context", () => {
    const result = parseCaptureMessage("Vestido Margarita talla M", catalog, new Date(), "NEW_ORDER");
    expect(result.payload.productId).toBe("product-1");
    expect(result.payload.size).toBe("M");
  });

  it("marks an unknown customer for explicit creation and suggests similar products", () => {
    const result = parseCaptureMessage(
      "Ana quiere Vestido Margaritta azul talla M, precio 250",
      catalog,
      new Date(2026, 7, 19, 12)
    );

    expect(result.payload.customerName).toBe("Ana");
    expect(result.payload.customerResolution).toBe("PENDING_CREATE");
    expect(result.payload.productId).toBeUndefined();
    expect(result.payload.productCandidates).toEqual([{ id: "product-1", name: "Vestido Margarita" }]);
    expect(result.missingFields).toEqual(["customer", "product"]);
  });

  it("marks a product without similar names for explicit creation", () => {
    const result = parseCaptureMessage(
      "Ana quiere Prenda Sol azul talla M, precio 250",
      catalog,
      new Date(2026, 7, 19, 12)
    );

    expect(result.payload.productName).toBe("Sol");
    expect(result.payload.productResolution).toBe("PENDING_CREATE");
    expect(result.payload.productCandidates).toBeUndefined();
    expect(result.missingFields).toEqual(["customer", "product"]);
  });

  it("uses the pending field to parse standalone follow-up answers", () => {
    const customer = parseCaptureMessage("Rosa Huamán", catalog, new Date(), "NEW_ORDER", { completionFields: ["customer"] });
    const product = parseCaptureMessage("producto Sol Andino", catalog, new Date(), "NEW_ORDER", { completionFields: ["product"] });
    const price = parseCaptureMessage("250 soles", catalog, new Date(), "NEW_ORDER", { completionFields: ["productPrice"] });
    const customerOnly = parseCaptureMessage("Ana", catalog, new Date(), "NEW_ORDER", { completionFields: ["customer", "product"] });

    expect(customer.payload.customerName).toBe("Rosa Huamán");
    expect(product.payload.productName).toBe("Sol Andino");
    expect(price.payload.agreedTotalPrice).toBe(250);
    expect(customerOnly.payload.customerName).toBe("Ana");
    expect(customerOnly.payload.productName).toBeUndefined();
  });
});
