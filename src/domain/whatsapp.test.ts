import { describe, expect, it } from "vitest";
import { customerOrderMessage, normalizeWhatsAppPhone, whatsappUrl } from "./whatsapp";

describe("WhatsApp helpers", () => {
  it("normalizes a Peruvian mobile number", () => {
    expect(normalizeWhatsAppPhone("987 654 321")).toBe("51987654321");
    expect(normalizeWhatsAppPhone("+51 987 654 321")).toBe("51987654321");
  });

  it("builds a wa.me URL", () => {
    expect(whatsappUrl("987654321", "Hola mundo")).toBe("https://wa.me/51987654321?text=Hola%20mundo");
  });

  it("includes ready state and balance in the customer message", () => {
    const message = customerOrderMessage({ customerName: "Diana Milagros", orderNumber: "P-00010", status: "READY_FOR_DELIVERY", balance: 120 });
    expect(message).toContain("Hola Diana");
    expect(message).toContain("listo para entregar");
    expect(message).toContain("S/ 120.00");
  });
});
