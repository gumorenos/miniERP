export function normalizeWhatsAppPhone(value: string, defaultCountryCode = "51") {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9) return `${defaultCountryCode}${digits}`;
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

export function whatsappUrl(phone: string, message: string) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function customerOrderMessage(input: { customerName: string; orderNumber: string; status: string; balance: number }) {
  const firstName = input.customerName.trim().split(/\s+/)[0] || input.customerName;
  const ready = ["READY_FOR_DELIVERY", "DELIVERED"].includes(input.status);
  const opening = ready
    ? `Hola ${firstName}, tu pedido ${input.orderNumber} de Samiiwara ya está listo para entregar.`
    : `Hola ${firstName}, te escribimos de Samiiwara sobre tu pedido ${input.orderNumber}.`;
  const balance = input.balance > 0 ? ` Tu saldo pendiente es S/ ${input.balance.toFixed(2)}.` : "";
  return `${opening}${balance}`;
}
