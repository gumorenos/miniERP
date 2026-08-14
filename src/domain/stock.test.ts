import { describe, expect, it } from "vitest";
import { projectedStock, validateFinishedStockDirection } from "./stock";

describe("finished stock rules", () => {
  it("requires positive quantities for stock entries", () => {
    expect(validateFinishedStockDirection("INITIAL", 2)).toBeNull();
    expect(validateFinishedStockDirection("PRODUCTION_IN", 1)).toBeNull();
    expect(validateFinishedStockDirection("INITIAL", -2)).toContain("positiva");
  });

  it("requires negative quantities for sales", () => {
    expect(validateFinishedStockDirection("SALE_OUT", -1)).toBeNull();
    expect(validateFinishedStockDirection("SALE_OUT", 1)).toContain("negativa");
    expect(validateFinishedStockDirection("ADJUSTMENT", -1)).toBeNull();
    expect(validateFinishedStockDirection("ADJUSTMENT", 1)).toBeNull();
  });

  it("projects corrected balances", () => {
    expect(projectedStock(8, 5, 3)).toBe(6);
    expect(projectedStock(2, 5, 1)).toBe(-2);
  });
});
