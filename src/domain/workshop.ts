export type CustomerOrderMetricInput = {
  status: string;
  orderDate?: string | null;
  agreedTotalPrice: number;
  totalPaid: number;
};

const closedStatuses = new Set(["DELIVERED", "CLOSED", "CANCELLED"]);

export function suggestedDeliveryDate(leadTimeDays: number, baseDate = new Date()) {
  const safeDays = Number.isFinite(leadTimeDays) ? Math.max(0, Math.trunc(leadTimeDays)) : 0;
  const date = new Date(baseDate);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + safeDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calculateCustomerMetrics(orders: CustomerOrderMetricInput[]) {
  const totalSales = orders.reduce((sum, order) => sum + order.agreedTotalPrice, 0);
  const totalPaid = orders.reduce((sum, order) => sum + order.totalPaid, 0);
  const activeOrders = orders.filter((order) => !closedStatuses.has(order.status)).length;
  const dates = orders.map((order) => order.orderDate).filter((value): value is string => Boolean(value)).sort().reverse();
  return {
    totalOrders: orders.length,
    activeOrders,
    totalSales,
    totalPaid,
    balance: totalSales - totalPaid,
    lastOrderDate: dates[0] ?? null
  };
}
