/**
 * QuickBooks Online push (daemon side). Decrypts the vendor's stored OAuth
 * token, refreshes it if it's near expiry (persisting the rotated token back),
 * and pushes a Klaro invoice into the vendor's QuickBooks company:
 * find-or-create the customer, then create the invoice. Sandbox by default.
 */
import { env } from "./env.js";
import { sb } from "./db.js";
import { log } from "./log.js";
import { decryptJson, encryptJson } from "./erpCrypto.js";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR = "minorversion=73";

interface QboTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  realmId: string;
}

export interface ErpConnRow {
  provider: string;
  auth_token_ciphertext: string | null;
  config_json: { realm_id?: string; environment?: string } | null;
}

export interface InvoiceForErp {
  id: string;
  amount_usdc: string | number;
  customer_name: string | null;
  customer_email: string | null;
}

function apiBase(): string {
  return env.QUICKBOOKS_ENV === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

async function refresh(tokens: QboTokens): Promise<QboTokens> {
  const basic = Buffer.from(
    `${env.QUICKBOOKS_CLIENT_ID}:${env.QUICKBOOKS_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    }).toString(),
  });
  if (!res.ok) throw new Error(`qbo_refresh_${res.status}: ${await res.text()}`);
  const t = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
    realmId: tokens.realmId,
  };
}

/** Decrypt + refresh-if-needed + persist the rotated token. */
async function validTokens(vendorId: string, conn: ErpConnRow): Promise<QboTokens> {
  if (!conn.auth_token_ciphertext) {
    throw new Error("quickbooks connection has no stored token");
  }
  let tokens = decryptJson<QboTokens>(conn.auth_token_ciphertext);
  if (!tokens.realmId && conn.config_json?.realm_id) {
    tokens.realmId = conn.config_json.realm_id;
  }
  // Refresh 60s before expiry. Intuit rotates the refresh token, so we persist.
  if (tokens.expiresAt < Date.now() + 60_000) {
    tokens = await refresh(tokens);
    const up = await sb()
      .from("erp_connections")
      .update({ auth_token_ciphertext: encryptJson(tokens) })
      .eq("vendor_id", vendorId)
      .eq("provider", "quickbooks");
    if (up.error) {
      // Non-fatal for THIS push (we have a fresh token in memory) but log it —
      // next push would otherwise refresh again from the stale stored token.
      log.warn("erp.qbo.token_persist_failed", { vendorId, err: up.error.message });
    }
  }
  return tokens;
}

async function qbo(
  method: "GET" | "POST",
  token: string,
  realmId: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${apiBase()}/v3/company/${realmId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`qbo_${method}_${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function findOrCreateCustomer(
  token: string,
  realmId: string,
  name: string,
): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const q = encodeURIComponent(`SELECT Id FROM Customer WHERE DisplayName = '${safe}'`);
  const found = (await qbo("GET", token, realmId, `/query?query=${q}&${MINOR}`)) as {
    QueryResponse?: { Customer?: { Id: string }[] };
  };
  const existing = found.QueryResponse?.Customer?.[0]?.Id;
  if (existing) return existing;
  const created = (await qbo("POST", token, realmId, `/customer?${MINOR}`, {
    DisplayName: name,
  })) as { Customer?: { Id: string } };
  const id = created.Customer?.Id;
  if (!id) throw new Error("qbo customer create returned no Id");
  return id;
}

/**
 * Push one Klaro invoice into QuickBooks. Returns the QBO invoice Id.
 * Only `invoice.create` maps to a QBO invoice today; other kinds are
 * acknowledged (honest no-op) until payment/tax-pack mapping lands.
 */
export async function pushInvoiceToQuickBooks(opts: {
  vendorId: string;
  conn: ErpConnRow;
  invoice: InvoiceForErp;
  kind: string;
}): Promise<{ qboInvoiceId?: string; skipped?: string }> {
  if (opts.kind !== "invoice.create") {
    return { skipped: `kind ${opts.kind} not yet mapped to QBO` };
  }
  const tokens = await validTokens(opts.vendorId, opts.conn);
  const name =
    opts.invoice.customer_name ||
    opts.invoice.customer_email ||
    `Klaro customer ${opts.invoice.id.slice(0, 8)}`;
  const customerId = await findOrCreateCustomer(tokens.accessToken, tokens.realmId, name);
  const amount = Number(opts.invoice.amount_usdc);
  const created = (await qbo("POST", tokens.accessToken, tokens.realmId, `/invoice?${MINOR}`, {
    CustomerRef: { value: customerId },
    // ItemRef "1" is the QBO sandbox default service item; sufficient to carry
    // the total. A richer line-item mapping can replace this once vendors map
    // their own QBO items.
    Line: [
      {
        Amount: amount,
        DetailType: "SalesItemLineDetail",
        Description: `Klaro invoice ${opts.invoice.id}`,
        SalesItemLineDetail: { ItemRef: { value: "1" } },
      },
    ],
    DocNumber: opts.invoice.id.slice(0, 21), // QBO DocNumber max 21 chars
    PrivateNote: `Synced from Klaro · invoice ${opts.invoice.id}`,
  })) as { Invoice?: { Id: string } };
  return { qboInvoiceId: created.Invoice?.Id };
}
