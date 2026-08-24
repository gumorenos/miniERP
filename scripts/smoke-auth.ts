import { responseSetCookie } from "./smoke-auth-headers";

export {};

const baseUrl = process.env.AUTH_SMOKE_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:3000";
const email = process.env.APP_USER_EMAIL?.trim() ?? "";
const password = process.env.APP_USER_PASSWORD ?? "";

function fail(code: string, message: string): never {
  console.error(`${code}: ${message}`);
  process.exit(1);
}

if (!email || !email.includes("@")) fail("AUTH_SMOKE_BLOCKED", "APP_USER_EMAIL no está configurado con un correo válido");
if (!password) fail("AUTH_SMOKE_BLOCKED", "APP_USER_PASSWORD no está configurado");

const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password })
});
const loginBody = await loginResponse.json().catch(() => ({})) as { error?: string };

if (!loginResponse.ok) {
  if (loginResponse.status === 400) fail("AUTH_PAYLOAD_INVALID", loginBody.error ?? "El login fue rechazado por el esquema");
  if (loginResponse.status === 401) fail("AUTH_CREDENTIALS_INVALID", "El correo o la contraseña no son válidos");
  fail("AUTH_LOGIN_FAILED", `HTTP ${loginResponse.status}`);
}

const setCookie = responseSetCookie(loginResponse.headers);
const cookie = setCookie.match(/(?:^|;\s*)(minierp_session=[^;]+)/)?.[1] ?? "";
if (!cookie) fail("AUTH_COOKIE_MISSING", "El login fue exitoso pero no devolvió minierp_session");

const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
const sessionBody = await sessionResponse.json().catch(() => ({})) as { mustChangePassword?: boolean; error?: string };
if (!sessionResponse.ok) fail("AUTH_SESSION_FAILED", `HTTP ${sessionResponse.status}: ${sessionBody.error ?? "respuesta inválida"}`);
if (sessionBody.mustChangePassword) fail("AUTH_PASSWORD_CHANGE_REQUIRED", "La cuenta sigue usando una contraseña temporal");

const bootstrapResponse = await fetch(`${baseUrl}/api/bootstrap`, { headers: { cookie } });
if (!bootstrapResponse.ok) {
  const body = await bootstrapResponse.json().catch(() => ({})) as { error?: string; code?: string };
  fail("AUTH_OPERATIONAL_ACCESS_FAILED", `HTTP ${bootstrapResponse.status}: ${body.code ?? body.error ?? "respuesta inválida"}`);
}

console.log(`AUTH_SMOKE_PASS base=${baseUrl} session=ok operational=ok`);
