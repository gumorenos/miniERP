import { describe, expect, it } from "vitest";
import { assertOrderTransition, calculateOrderFinancials, embroideryOverdueDays } from "./order";

describe("order domain rules", () => {
  it("calculates paid balance, costs and margin from payment and cost movements", () => {
    const result = calculateOrderFinancials({
      agreedTotalPrice: 320,
      payments: [100, 220],
      items: [
        {
          estimatedMaterialCost: 19.5,
          actualMaterialCost: 18,
          estimatedOwnLaborCost: 15,
          actualOwnLaborCost: 15,
          estimatedPackagingCost: 2,
          estimatedEmbroideryCost: 80,
          actualEmbroideryCost: 95
        }
      ]
    });

    expect(result.totalPaid).toBe(320);
    expect(result.balance).toBe(0);
    expect(result.estimatedCost).toBe(116.5);
    expect(result.actualCost).toBe(128);
    expect(result.costForMargin).toBe(130);
    expect(result.margin).toBe(190);
  });

  it("allows forward state movement and rejects edits after close", () => {
    expect(() => assertOrderTransition("READY_TO_CUT", "CUT")).not.toThrow();
    expect(() => assertOrderTransition("CLOSED", "ASSEMBLY")).toThrow();
  });

  it("derives embroidery overdue days only while pending", () => {
    expect(embroideryOverdueDays("2026-08-01", null, new Date("2026-08-08T12:00:00Z"))).toBe(7);
    expect(embroideryOverdueDays("2026-08-01", "2026-08-03T12:00:00Z", new Date("2026-08-08T12:00:00Z"))).toBe(0);
  });
});

