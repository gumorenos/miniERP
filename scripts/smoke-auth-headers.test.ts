import { describe, expect, it } from "vitest";
import { responseSetCookie } from "./smoke-auth-headers";

describe("authenticated smoke cookie extraction", () => {
  it("uses getSetCookie when it returns an array", () => {
    const headers = {
      get: () => "fallback=value",
      getSetCookie: () => ["minierp_session=array-value; Path=/"]
    };
    expect(responseSetCookie(headers)).toBe("minierp_session=array-value; Path=/");
  });

  it("falls back when getSetCookie returns undefined", () => {
    const headers = {
      get: () => "minierp_session=fallback-value; Path=/",
      getSetCookie: () => undefined
    };
    expect(responseSetCookie(headers)).toBe("minierp_session=fallback-value; Path=/");
  });

  it("falls back when getSetCookie throws", () => {
    const headers = {
      get: () => "minierp_session=error-fallback; Path=/",
      getSetCookie: () => { throw new Error("unsupported"); }
    };
    expect(responseSetCookie(headers)).toBe("minierp_session=error-fallback; Path=/");
  });
});
