/**
 * QuickBooks Online (Intuit) OAuth 2.0 + token model. Sandbox by default.
 * The vendor authorizes Klaro on the Intuit consent screen; the callback
 * exchanges the code for an access + refresh token pair (stored encrypted on
 * the vendor's erp_connections row), and the daemon's erpSync worker uses them
 * to push invoices into the QuickBooks sandbox company.
 *
 * Docs: developer.intuit.com — OAuth 2.0 authorization-code grant.
 */
import {
  QUICKBOOKS_CLIENT_ID,
  QUICKBOOKS_CLIENT_SECRET,
  QUICKBOOKS_ENV,
} from "./env";

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

/** Sandbox vs production QBO API base. */
export function qboApiBase(): string {
  return QUICKBOOKS_ENV === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export interface QboTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when the access token expires. */
  expiresAt: number;
  realmId: string;
}

export const quickbooksConfigured = (): boolean =>
  Boolean(QUICKBOOKS_CLIENT_ID && QUICKBOOKS_CLIENT_SECRET);

/** Build the Intuit consent URL the vendor is redirected to. */
export function authorizeUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: QUICKBOOKS_CLIENT_ID ?? "",
    response_type: "code",
    scope: QBO_SCOPE,
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

async function tokenRequest(
  body: URLSearchParams,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const basic = Buffer.from(
    `${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`qbo_token_${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

/** Exchange the authorization code for the first token pair. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  realmId: string,
): Promise<QboTokens> {
  const t = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  );
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
    realmId,
  };
}
