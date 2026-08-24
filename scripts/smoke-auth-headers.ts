type HeadersWithSetCookie = Pick<Headers, "get"> & {
  getSetCookie?: () => string[] | undefined;
};

export function responseSetCookie(headers: HeadersWithSetCookie) {
  const fallback = headers.get("set-cookie") ?? "";
  if (typeof headers.getSetCookie !== "function") return fallback;
  try {
    const values = headers.getSetCookie();
    return Array.isArray(values) && values.length > 0 ? values[0] : fallback;
  } catch {
    return fallback;
  }
}
