/**
 * Rotatable-secret reader.
 * Klaro signs webhooks + cron headers + cookies with HMAC. Rotating those
 * secrets needs to support BOTH the new + old secret accepting valid signatures
 * during the cutover window. Pattern: store the active secret in
 * `<NAME>_SECRET`, the previous secret in `<NAME>_SECRET_PREVIOUS`. Verifiers
 * use `validSecrets("FOO")` to get an array; signers use `currentSecret("FOO")`
 * to get the newest one.
 * Server-only: never import in client components.
 */

export function currentSecret(name: string): string | undefined {
  return process.env[`${name}_SECRET`];
}

export function validSecrets(name: string): string[] {
  const out: string[] = [];
  const current = process.env[`${name}_SECRET`];
  const previous = process.env[`${name}_SECRET_PREVIOUS`];
  if (current) out.push(current);
  if (previous) out.push(previous);
  return out;
}

/** Constant-time equality. Use when comparing HMAC digests. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
