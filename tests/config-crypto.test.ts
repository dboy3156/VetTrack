import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptConfigValue, decryptConfigValue } from "../server/lib/config-crypto";

describe("config-crypto", () => {
  const TEST_KEY = "a".repeat(64); // 32 bytes as hex

  beforeEach(() => {
    process.env.DB_CONFIG_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.DB_CONFIG_ENCRYPTION_KEY;
  });

  it("encrypts and decrypts a value round-trip", () => {
    const plain = "super-secret-password";
    const encrypted = encryptConfigValue(plain);
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(decryptConfigValue(encrypted)).toBe(plain);
  });

  it("decrypt passes through plaintext values (no prefix)", () => {
    expect(decryptConfigValue("plaintext-value")).toBe("plaintext-value");
  });

  it("two encryptions of the same value produce different ciphertexts (random IV)", () => {
    const a = encryptConfigValue("same");
    const b = encryptConfigValue("same");
    expect(a).not.toBe(b);
    expect(decryptConfigValue(a)).toBe("same");
    expect(decryptConfigValue(b)).toBe("same");
  });

  it("encrypt is passthrough when key not set", () => {
    delete process.env.DB_CONFIG_ENCRYPTION_KEY;
    expect(encryptConfigValue("plain")).toBe("plain");
  });

  it("decrypt throws when key required but missing", () => {
    // Encrypt with key set (from beforeEach)
    const enc = encryptConfigValue("test");
    // Remove the key before decrypting
    delete process.env.DB_CONFIG_ENCRYPTION_KEY;
    expect(() => decryptConfigValue(enc)).toThrow("DB_CONFIG_ENCRYPTION_KEY required");
  });
});
