export type FinishedStockMovementType = "INITIAL" | "PRODUCTION_IN" | "SALE_OUT" | "ADJUSTMENT";

export function validateFinishedStockDirection(type: FinishedStockMovementType, quantitySigned: number) {
  if (!Number.isInteger(quantitySigned) || quantitySigned === 0) return "La cantidad debe ser un entero distinto de cero";
  if ((type === "INITIAL" || type === "PRODUCTION_IN") && quantitySigned < 0) return "Las entradas de stock deben tener cantidad positiva";
  if (type === "SALE_OUT" && quantitySigned > 0) return "Las salidas por venta deben tener cantidad negativa";
  return null;
}

export function projectedStock(currentBalance: number, previousQuantity: number, nextQuantity: number) {
  return currentBalance - previousQuantity + nextQuantity;
}
