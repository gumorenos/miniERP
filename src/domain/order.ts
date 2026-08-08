import { orderStatuses, productionFlow, type OrderCostInput, type OrderFinancials, type OrderStatus } from "./types";

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const n = (value: number | string | null | undefined) => (value == null ? 0 : Number(value));

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
      n(item.estimatedMaterialCost) +
      n(item.estimatedOwnLaborCost) +
      n(item.estimatedPackagingCost) +
      n(item.otherEstimatedDirectCost) +
      n(item.estimatedEmbroideryCost)
    );
  }, 0);
  const actualCost = input.items.reduce((sum, item) => {
    return (
      sum +
      n(item.actualMaterialCost) +
      n(item.actualOwnLaborCost) +
      n(item.actualPackagingCost) +
      n(item.otherActualDirectCost) +
      n(item.actualEmbroideryCost)
    );
  }, 0);
  const fallbackCost = input.items.reduce((sum, item) => {
    return (
      sum +
      (item.actualMaterialCost == null ? n(item.estimatedMaterialCost) : n(item.actualMaterialCost)) +
      (item.actualOwnLaborCost == null ? n(item.estimatedOwnLaborCost) : n(item.actualOwnLaborCost)) +
      (item.actualPackagingCost == null ? n(item.estimatedPackagingCost) : n(item.actualPackagingCost)) +
      (item.otherActualDirectCost == null ? n(item.otherEstimatedDirectCost) : n(item.otherActualDirectCost)) +
      (item.actualEmbroideryCost == null ? n(item.estimatedEmbroideryCost) : n(item.actualEmbroideryCost))
    );
  }, 0);
  const totalPaid = input.payments.reduce((sum, amount) => sum + n(amount), 0);

  return {
    agreedTotalPrice: money(input.agreedTotalPrice),
    totalPaid: money(totalPaid),
    balance: money(input.agreedTotalPrice - totalPaid),
    estimatedCost: money(estimatedCost),
    actualCost: money(actualCost),
    costForMargin: money(fallbackCost),
    margin: money(input.agreedTotalPrice - fallbackCost)
  };
}

export function embroideryOverdueDays(expectedReturnDate: string | Date | null | undefined, receivedAt?: string | Date | null, today = new Date()) {
  if (!expectedReturnDate || receivedAt) return 0;
  const expected = new Date(`${String(expectedReturnDate).slice(0, 10)}T00:00:00Z`);
  const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const diff = Math.floor((current.getTime() - expected.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

