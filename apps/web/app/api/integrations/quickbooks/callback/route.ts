import { NextRequest } from "next/server";
import { requireVendor } from "@/lib/auth";
import { exchangeCode } from "@/lib/quickbooks";
import { QUICKBOOKS_REDIRECT_URI, QUICKBOOKS_ENV } from "@/lib/env";
import { encryptJson } from "@/lib/erpCrypto";
import { serviceDb } from "@/lib/db";
import { captureError } from "@/lib/sentry";

/**
 * QuickBooks OAuth callback. Intuit redirects here with `code`, `state`, and
 * `realmId` (the connected company id). We verify the CSRF state cookie,
 * exchange the code for a token pair, encrypt it (AES-256-GCM, ERP_ENC_KEY),
 * and upsert the vendor's `erp_connections` row. The daemon's erpSync worker
 * then decrypts + pushes invoices to that company. Always redirects back to
 * the ERP settings page with an honest status query param.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const back = (q: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/vendor/integrations/erp?${q}`,
        // Clear the one-time CSRF cookie.
        "Set-Cookie": `qbo_state=; Path=/; HttpOnly; Max-Age=0`,
      },
    });

  let vendorId: string;
  try {
    const { vendor } = await requireVendor();
    vendorId = vendor.id;
  } catch {
    return new Response(null, { status: 302, headers: { Location: `${origin}/signin` } });
  }

  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("qbo_state")?.value;

  if (!code || !realmId || !state || !cookieState || state !== cookieState) {
    return back("erp_error=quickbooks_oauth_state");
  }

  const redirectUri =
    QUICKBOOKS_REDIRECT_URI ?? `${origin}/api/integrations/quickbooks/callback`;

  let tokens;
  try {
    tokens = await exchangeCode(code, redirectUri, realmId);
  } catch (e) {
    captureError(e, { where: "quickbooks.callback.exchange" });
    return back("erp_error=quickbooks_token_exchange");
  }

  try {
    const db = serviceDb() as unknown as {
      from: (t: string) => {
        upsert: (
          v: object,
          o: object,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await db.from("erp_connections").upsert(
      {
        vendor_id: vendorId,
        provider: "quickbooks",
        status: "active",
        auth_token_ciphertext: encryptJson(tokens),
        config_json: { realm_id: realmId, environment: QUICKBOOKS_ENV },
        health_md: "Connected via OAuth",
      },
      { onConflict: "vendor_id,provider" },
    );
    if (error) throw new Error(error.message);
  } catch (e) {
    captureError(e, { where: "quickbooks.callback.store" });
    return back("erp_error=quickbooks_store");
  }

  return back("connected=quickbooks");
}
