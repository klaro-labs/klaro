/**
 * ERP token encryption — AES-256-GCM at the application layer so OAuth refresh
 * tokens are never stored in plaintext. The same `ERP_ENC_KEY` (32-byte hex) is
 * shared by the web app (encrypts on the OAuth callback) and the daemon
 * (decrypts to call the provider API). Ciphertext format, base64-encoded:
 *   iv(12) ‖ authTag(16) ‖ ciphertext
 * Server-only (node:crypto); imported by the QuickBooks callback route + the
 * erp_connections token path.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ERP_ENC_KEY } from "./env";

function key(): Buffer {
  if (!ERP_ENC_KEY) throw new Error("ERP_ENC_KEY not set");
  const k = Buffer.from(ERP_ENC_KEY, "hex");
  if (k.length !== 32) throw new Error("ERP_ENC_KEY must be 32 bytes (64 hex chars)");
  return k;
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
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
