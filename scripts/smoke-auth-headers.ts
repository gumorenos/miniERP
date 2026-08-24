export function sessionCookieFromSetCookieHeaders(headers: readonly string[] | string | undefined) {
  const candidates = typeof headers === "string" ? [headers] : headers ?? [];
  const raw = candidates.find((value) => /(?:^|[;,]\s*)minierp_session=[^;,\s]+/.test(value)) ?? "";
  return raw.match(/(?:^|[;,]\s*)(minierp_session=[^;,\s]+)/)?.[1] ?? "";
}
