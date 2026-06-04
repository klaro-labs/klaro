/**
 * ERP token decryption (daemon side) — mirrors apps/web/lib/erpCrypto.ts.
 * AES-256-GCM with the shared ERP_ENC_KEY so the daemon can read the OAuth
 * tokens the web OAuth callback encrypted into erp_connections.auth_token_ciphertext.
 * Format (base64): iv(12) ‖ authTag(16) ‖ ciphertext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env.js";

function key(): Buffer {
  if (!env.ERP_ENC_KEY) throw new Error("ERP_ENC_KEY not set");
  const k = Buffer.from(env.ERP_ENC_KEY, "hex");
  if (k.length !== 32) throw new Error("ERP_ENC_KEY must be 32 bytes (64 hex chars)");
  return k;
}

export function decryptJson<T>(ciphertext: string): T {
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}

/** Re-encrypt rotated tokens after a refresh so the new refresh token persists. */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}
