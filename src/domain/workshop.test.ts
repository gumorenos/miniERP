import { describe, expect, it } from "vitest";
import { calculateCustomerMetrics, suggestedDeliveryDate } from "./workshop";

describe("workshop helpers", () => {
  it("calculates suggested dates", () => {
    const base = new Date("2026-08-13T12:00:00-05:00");
    expect(suggestedDeliveryDate(25, base)).toBe("2026-09-07");
    expect(suggestedDeliveryDate(-3, base)).toBe("2026-08-13");
  });

  it("summarizes customer orders", () => {
    const result = calculateCustomerMetrics([
      { status: "ORDER_RECEIVED", orderDate: "2026-08-10", agreedTotalPrice: 320, totalPaid: 100 },
      { status: "CLOSED", orderDate: "2026-07-01", agreedTotalPrice: 250, totalPaid: 250 }
    ]);
    expect(result.totalOrders).toBe(2);
    expect(result.activeOrders).toBe(1);
    expect(result.totalSales).toBe(570);
    expect(result.totalPaid).toBe(350);
    expect(result.balance).toBe(220);
    expect(result.lastOrderDate).toBe("2026-08-10");
  });
});
