export type CustomerOrderMetricInput = {
  status: string;
  orderDate?: string | null;
  agreedTotalPrice: number;
  totalPaid: number;
};

const closedStatuses = new Set(["CLOSED", "CANCELLED"]);

export function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function limaBusinessDate(date = new Date()) { return dateInTimeZone(date, "America/Lima"); }
export function limaBusinessDateTimestamp(date = new Date()) { return new Date(`${limaBusinessDate(date)}T12:00:00.000Z`); }

export function suggestedDeliveryDate(leadTimeDays: number, baseDate = new Date()) {
  const safeDays = Number.isFinite(leadTimeDays) ? Math.max(0, Math.trunc(leadTimeDays)) : 0;
  const date = new Date(baseDate); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + safeDays); return localDateInputValue(date);
}

export function calculateCustomerMetrics(orders: CustomerOrderMetricInput[]) {
  const totalSales = orders.reduce((sum, order) => sum + order.agreedTotalPrice, 0);
  const totalPaid = orders.reduce((sum, order) => sum + order.totalPaid, 0);
  const activeOrders = orders.filter((order) => !closedStatuses.has(order.status)).length;
  const dates = orders.map((order) => order.orderDate).filter((value): value is string => Boolean(value)).sort().reverse();
  return { totalOrders: orders.length, activeOrders, totalSales, totalPaid, balance: totalSales - totalPaid, lastOrderDate: dates[0] ?? null };
}
