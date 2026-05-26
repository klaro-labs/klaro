/**
 * WebAuthn (passkey) client helpers — minimal wrappers over the browser API.
 * Registration: server creates options, client calls `navigator.credentials.create`,
 * sends attestation back. Klaro stores `credentialId` + `publicKey` + `counter`
 * in `webauthn_credentials` (Supabase).
 * Sign-in: server creates assertion options + challenge, client calls
 * `navigator.credentials.get`, sends back to verify endpoint, server issues
 * the session cookie. Used as the fastest sign-in path on mobile.
 */
"use client";

export function webAuthnSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

export interface RegistrationOptions {
  // Anything the server passes back verbatim. Shape mirrors PublicKeyCredentialCreationOptions
  // with `challenge` + `user.id` base64-encoded as strings.
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams?: PublicKeyCredentialParameters[];
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlToBuf(s: string): ArrayBuffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

export async function registerPasskey(opts: RegistrationOptions): Promise<{
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: AuthenticatorTransport[];
  };
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
} | null> {
  if (!webAuthnSupported()) return null;
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: b64urlToBuf(opts.challenge),
      rp: opts.rp,
      user: {
        id: b64urlToBuf(opts.user.id),
        name: opts.user.name,
        displayName: opts.user.displayName,
      },
      pubKeyCredParams: opts.pubKeyCredParams ?? [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      timeout: opts.timeout ?? 60_000,
      attestation: opts.attestation ?? "none",
      authenticatorSelection: opts.authenticatorSelection ?? {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    },
  })) as PublicKeyCredential | null;
  if (!cred) return null;
  const att = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: b64url(cred.rawId),
    type: "public-key",
    response: {
      clientDataJSON: b64url(att.clientDataJSON),
      attestationObject: b64url(att.attestationObject),
      transports: att.getTransports?.() as AuthenticatorTransport[] | undefined,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

export interface AssertionOptions {
  challenge: string;
  rpId?: string;
  allowCredentials?: { id: string; type: "public-key" }[];
  timeout?: number;
  userVerification?: UserVerificationRequirement;
}

export async function signInWithPasskey(opts: AssertionOptions): Promise<{
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
} | null> {
  if (!webAuthnSupported()) return null;
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: b64urlToBuf(opts.challenge),
      rpId: opts.rpId,
      timeout: opts.timeout ?? 60_000,
      userVerification: opts.userVerification ?? "preferred",
      allowCredentials: opts.allowCredentials?.map((c) => ({
        type: c.type,
        id: b64urlToBuf(c.id),
      })),
    },
  })) as PublicKeyCredential | null;
  if (!cred) return null;
  const a = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: b64url(cred.rawId),
    type: "public-key",
    response: {
      clientDataJSON: b64url(a.clientDataJSON),
      authenticatorData: b64url(a.authenticatorData),
      signature: b64url(a.signature),
      userHandle: a.userHandle ? b64url(a.userHandle) : undefined,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}
