import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { sessionCookieFromSetCookieHeaders } from "./smoke-auth-headers";

export {};

const baseUrl = process.env.AUTH_SMOKE_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:3000";
const email = process.env.APP_USER_EMAIL?.trim() ?? "";
const password = process.env.APP_USER_PASSWORD ?? "";

function fail(code: string, message: string): never {
  console.error(`${code}: ${message}`);
  process.exit(1);
}

type JsonResponse = {
  status: number;
  body: unknown;
  setCookies: string[];
};

function requestJson(path: string, options: { method?: string; cookie?: string; body?: unknown } = {}) {
  const target = new URL(`${baseUrl}${path}`);
  const serializedBody = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers: Record<string, string> = { accept: "application/json" };
  if (serializedBody !== undefined) headers["content-type"] = "application/json";
  if (options.cookie) headers.cookie = options.cookie;
  const requestFn = target.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise<JsonResponse>((resolve, reject) => {
    const request = requestFn(target, { method: options.method ?? "GET", headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const body = (() => {
          try { return raw ? JSON.parse(raw) : {}; } catch { return { raw }; }
        })();
        resolve({
          status: response.statusCode ?? 0,
          body,
          setCookies: response.headers["set-cookie"] ?? []
        });
      });
    });
    request.on("error", reject);
    if (serializedBody !== undefined) request.write(serializedBody);
    request.end();
  });
}

if (!email || !email.includes("@")) fail("AUTH_SMOKE_BLOCKED", "APP_USER_EMAIL no está configurado con un correo válido");
if (!password) fail("AUTH_SMOKE_BLOCKED", "APP_USER_PASSWORD no está configurado");

const loginResponse = await requestJson("/api/auth/login", {
  method: "POST",
  body: { email, password }
});
const loginBody = loginResponse.body as { error?: string };

if (loginResponse.status < 200 || loginResponse.status >= 300) {
  if (loginResponse.status === 400) fail("AUTH_PAYLOAD_INVALID", loginBody.error ?? "El login fue rechazado por el esquema");
  if (loginResponse.status === 401) fail("AUTH_CREDENTIALS_INVALID", "El correo o la contraseña no son válidos");
  fail("AUTH_LOGIN_FAILED", `HTTP ${loginResponse.status}`);
}

const cookie = sessionCookieFromSetCookieHeaders(loginResponse.setCookies);
if (!cookie) fail("AUTH_COOKIE_MISSING", "El login fue exitoso pero no devolvió minierp_session");

const sessionResponse = await requestJson("/api/auth/session", { cookie });
const sessionBody = sessionResponse.body as { mustChangePassword?: boolean; error?: string };
if (sessionResponse.status < 200 || sessionResponse.status >= 300) fail("AUTH_SESSION_FAILED", `HTTP ${sessionResponse.status}: ${sessionBody.error ?? "respuesta inválida"}`);
if (sessionBody.mustChangePassword) fail("AUTH_PASSWORD_CHANGE_REQUIRED", "La cuenta sigue usando una contraseña temporal");

const bootstrapResponse = await requestJson("/api/bootstrap", { cookie });
if (bootstrapResponse.status < 200 || bootstrapResponse.status >= 300) {
  const body = bootstrapResponse.body as { error?: string; code?: string };
  fail("AUTH_OPERATIONAL_ACCESS_FAILED", `HTTP ${bootstrapResponse.status}: ${body.code ?? body.error ?? "respuesta inválida"}`);
}

console.log(`AUTH_SMOKE_PASS base=${baseUrl} session=ok operational=ok`);
