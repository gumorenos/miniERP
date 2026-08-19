export function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Round to cents using symmetric half-away-from-zero behavior. */
export function roundMoney(value: number) {
  const safe = toNumber(value);
  const sign = safe < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(safe) + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: unknown) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })
    .format(roundMoney(toNumber(value)))
    .replace(/\u00a0/g, " ");
}
