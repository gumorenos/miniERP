import { orderStatuses, productionFlow, type OrderCostInput, type OrderFinancials, type OrderStatus } from "./types";
import { roundMoney, toNumber } from "./money";

export function assertKnownOrderStatus(status: string): asserts status is OrderStatus {
  if (!orderStatuses.includes(status as OrderStatus)) {
    throw new Error(`Estado de pedido desconocido: ${status}`);
  }
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  if (from === "CANCELLED" || from === "CLOSED") return false;
  if (to === "CANCELLED") return true;
  const fromIndex = productionFlow.indexOf(from);
  const toIndex = productionFlow.indexOf(to);
  return fromIndex >= 0 && toIndex >= 0 && toIndex >= fromIndex;
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Transicion invalida de ${from} a ${to}`);
  }
}

export function calculateOrderFinancials(input: OrderCostInput): OrderFinancials {
  const estimatedCost = input.items.reduce((sum, item) => {
    return (
      sum +
      toNumber(item.estimatedMaterialCost) +
      toNumber(item.estimatedOwnLaborCost) +
      toNumber(item.estimatedPackagingCost) +
      toNumber(item.otherEstimatedDirectCost) +
      toNumber(item.estimatedEmbroideryCost)
    );
  }, 0);
  const actualCost = input.items.reduce((sum, item) => {
    return (
      sum +
      toNumber(item.actualMaterialCost) +
      toNumber(item.actualOwnLaborCost) +
      toNumber(item.actualPackagingCost) +
      toNumber(item.otherActualDirectCost) +
      toNumber(item.actualEmbroideryCost)
    );
  }, 0);
  const fallbackCost = input.items.reduce((sum, item) => {
    return (
      sum +
      (item.actualMaterialCost == null ? toNumber(item.estimatedMaterialCost) : toNumber(item.actualMaterialCost)) +
      (item.actualOwnLaborCost == null ? toNumber(item.estimatedOwnLaborCost) : toNumber(item.actualOwnLaborCost)) +
      (item.actualPackagingCost == null ? toNumber(item.estimatedPackagingCost) : toNumber(item.actualPackagingCost)) +
      (item.otherActualDirectCost == null ? toNumber(item.otherEstimatedDirectCost) : toNumber(item.otherActualDirectCost)) +
      (item.actualEmbroideryCost == null ? toNumber(item.estimatedEmbroideryCost) : toNumber(item.actualEmbroideryCost))
    );
  }, 0);
  const totalPaid = input.payments.reduce((sum, amount) => sum + toNumber(amount), 0);

  return {
    agreedTotalPrice: roundMoney(input.agreedTotalPrice),
    totalPaid: roundMoney(totalPaid),
    balance: roundMoney(input.agreedTotalPrice - totalPaid),
    estimatedCost: roundMoney(estimatedCost),
    actualCost: roundMoney(actualCost),
    costForMargin: roundMoney(fallbackCost),
    margin: roundMoney(input.agreedTotalPrice - fallbackCost)
  };
}

export function embroideryOverdueDays(expectedReturnDate: string | Date | null | undefined, receivedAt?: string | Date | null, today = new Date()) {
  if (!expectedReturnDate || receivedAt) return 0;
  const expected = new Date(`${String(expectedReturnDate).slice(0, 10)}T00:00:00Z`);
  const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const diff = Math.floor((current.getTime() - expected.getTime()) / 86_400_000);
  return Math.max(0, diff);
}
