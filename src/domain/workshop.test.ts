import { describe, expect, it } from "vitest";
import { calculateCustomerMetrics, limaBusinessDate, limaBusinessDateTimestamp, localDateInputValue, suggestedDeliveryDate } from "./workshop";

describe("workshop helpers", () => {
  it("calculates suggested dates", () => {
    const base = new Date("2026-08-13T12:00:00-05:00");
    expect(suggestedDeliveryDate(25, base)).toBe("2026-09-07");
    expect(suggestedDeliveryDate(-3, base)).toBe("2026-08-13");
  });

  it("keeps date inputs on the browser local calendar day", () => {
    const lateLocalTime = new Date(2026, 7, 13, 23, 30, 0);
    expect(localDateInputValue(lateLocalTime)).toBe("2026-08-13");
  });

  it("uses the Lima business day across the UTC date rollover", () => {
    const utcAfterMidnight = new Date("2026-08-14T02:30:00.000Z");
    expect(limaBusinessDate(utcAfterMidnight)).toBe("2026-08-13");
    expect(limaBusinessDateTimestamp(utcAfterMidnight).toISOString()).toBe("2026-08-13T12:00:00.000Z");
  });

  it("summarizes customer orders and keeps delivered orders active until closed", () => {
    const result = calculateCustomerMetrics([
      { status: "ORDER_RECEIVED", orderDate: "2026-08-10", agreedTotalPrice: 320, totalPaid: 100 },
      { status: "DELIVERED", orderDate: "2026-08-05", agreedTotalPrice: 200, totalPaid: 50 },
      { status: "CLOSED", orderDate: "2026-07-01", agreedTotalPrice: 250, totalPaid: 250 }
    ]);
    expect(result.totalOrders).toBe(3);
    expect(result.activeOrders).toBe(2);
    expect(result.totalSales).toBe(770);
    expect(result.totalPaid).toBe(400);
    expect(result.balance).toBe(370);
    expect(result.lastOrderDate).toBe("2026-08-10");
  });
});
