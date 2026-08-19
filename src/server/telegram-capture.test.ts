import { describe, expect, it } from "vitest";
import {
  matchesTelegramSharedSecret,
  readTelegramCaptureConfig,
  telegramCaptureConfigReady
} from "./telegram-capture";

const env = {
  TELEGRAM_CAPTURE_SHARED_SECRET: "a".repeat(32),
  TELEGRAM_CAPTURE_BUSINESS_ID: "11111111-1111-4111-8111-111111111111",
  TELEGRAM_CAPTURE_USER_ID: "22222222-2222-4222-8222-222222222222",
  TELEGRAM_CAPTURE_ALLOWED_CHAT_IDS: "-100123,456"
};

describe("Telegram capture configuration", () => {
  it("accepts a complete fail-closed configuration", () => {
    const config = readTelegramCaptureConfig(env);
    expect(telegramCaptureConfigReady(config)).toBe(true);
    expect(config.allowedChatIds.has("-100123")).toBe(true);
  });

  it("rejects missing authorization scope or short secrets", () => {
    expect(telegramCaptureConfigReady(readTelegramCaptureConfig({
      ...env,
      TELEGRAM_CAPTURE_SHARED_SECRET: "short"
    }))).toBe(false);
    expect(telegramCaptureConfigReady(readTelegramCaptureConfig({
      ...env,
      TELEGRAM_CAPTURE_ALLOWED_CHAT_IDS: ""
    }))).toBe(false);
  });

  it("compares the shared secret without accepting a different length", () => {
    expect(matchesTelegramSharedSecret("a".repeat(32), "a".repeat(32))).toBe(true);
    expect(matchesTelegramSharedSecret("a".repeat(31), "a".repeat(32))).toBe(false);
    expect(matchesTelegramSharedSecret("b".repeat(32), "a".repeat(32))).toBe(false);
  });
});
