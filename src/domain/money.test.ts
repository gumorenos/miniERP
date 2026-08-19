import { describe, expect, it } from "vitest";
import { formatMoney, roundMoney, toNumber } from "./money";

describe("money helpers", () => {
  it("normalizes invalid database values to zero", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber("not-a-number")).toBe(0);
    expect(toNumber("12.50")).toBe(12.5);
  });

  it("rounds positive and negative values symmetrically to cents", () => {
    expect(roundMoney(12.345)).toBe(12.35);
    expect(roundMoney(-12.345)).toBe(-12.35);
    expect(roundMoney(Number.NaN)).toBe(0);
  });

  it("formats PEN without exposing NaN", () => {
    expect(formatMoney("not-a-number")).toContain("0.00");
    expect(formatMoney(12.5)).toContain("12.50");
  });
});
