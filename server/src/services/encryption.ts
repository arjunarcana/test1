/**
 * AES-256-GCM encryption helpers.
 *
 * When ENCRYPTION_KEY is set (64 hex chars = 32 bytes), text is encrypted as:
 *   iv_hex:ciphertext_hex:auth_tag_hex
 *
 * When ENCRYPTION_KEY is empty, functions are pass-through (plaintext).
 */

import crypto from "node:crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

/**
 * Derive the raw key buffer from the hex-encoded config value.
 * Returns null if encryption is not configured.
 */
function getKey(): Buffer | null {
  if (!config.encryptionKey || config.encryptionKey.length !== 64) {
    return null;
  }
  return Buffer.from(config.encryptionKey, "hex");
}

/**
 * Encrypt plaintext. Returns "iv:ciphertext:tag" in hex.
 * If no encryption key is configured, returns the plaintext unchanged.
 */
export function encrypt(text: string): string {
  const key = getKey();
  if (!key) return text;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${encrypted}:${tag}`;
}

/**
 * Decrypt a string produced by encrypt().
 * If no encryption key is configured, returns the input unchanged.
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  if (!key) return encrypted;

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    // Not an encrypted value; return as-is (backward compatibility)
    return encrypted;
  }

  const [ivHex, cipherHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
