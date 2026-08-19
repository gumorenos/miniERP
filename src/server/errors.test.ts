import { describe, expect, it } from "vitest";
import { AppError, errorResponse, withSecurityHeaders } from "./errors";

describe("server error handling", () => {
  it("serializes application errors with status and stable code", async () => {
    const response = errorResponse(new AppError("No encontrado", 404, "NOT_FOUND"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "No encontrado", code: "NOT_FOUND" });
  });

  it("adds baseline security headers to every response", () => {
    const response = withSecurityHeaders(new Response("ok"));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});
