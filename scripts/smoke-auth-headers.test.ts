import { describe, expect, it } from "vitest";
import { sessionCookieFromSetCookieHeaders } from "./smoke-auth-headers";

describe("authenticated smoke cookie extraction", () => {
  it("extracts the session cookie from raw response headers", () => {
    expect(sessionCookieFromSetCookieHeaders([
      "other=value; Path=/",
      "minierp_session=wire-value; Path=/; HttpOnly; SameSite=Lax"
    ])).toBe("minierp_session=wire-value");
  });

  it("returns empty when the session cookie is absent", () => {
    expect(sessionCookieFromSetCookieHeaders(["other=value; Path=/"])).toBe("");
  });

  it("handles an undefined raw header list", () => {
    expect(sessionCookieFromSetCookieHeaders(undefined)).toBe("");
  });
});
