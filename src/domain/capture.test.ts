import { describe, expect, it } from "vitest";
import { parseCaptureMessage } from "./capture";

const catalog = {
  customers: [{ id: "customer-1", name: "María Quispe", phone: "987654321" }],
  products: [{ id: "product-1", name: "Vestido Margarita" }]
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
});
