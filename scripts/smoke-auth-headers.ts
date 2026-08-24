export function sessionCookieFromSetCookieHeaders(headers: readonly string[] | undefined) {
  const raw = headers?.find((value) => /(?:^|;\s*)minierp_session=[^;]+/.test(value)) ?? "";
  return raw.match(/(?:^|;\s*)(minierp_session=[^;]+)/)?.[1] ?? "";
}
