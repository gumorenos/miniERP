import { z } from "zod";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
    public readonly code = "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON() {
    return { error: this.message, code: this.code };
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({ error: "La solicitud contiene datos inválidos.", code: "VALIDATION_ERROR" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
  if (error instanceof AppError) {
    return new Response(JSON.stringify(error.toJSON()), {
      status: error.status,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
  console.error("unhandled_request_error", error);
  return new Response(JSON.stringify({ error: "Ocurrió un error inesperado.", code: "INTERNAL_ERROR" }), {
    status: 500,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
