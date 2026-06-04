import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { requireVendor } from "@/lib/auth";
import { authorizeUrl, quickbooksConfigured } from "@/lib/quickbooks";
import { QUICKBOOKS_REDIRECT_URI } from "@/lib/env";

/**
 * Start the QuickBooks OAuth flow. Vendor-gated. Sets a short-lived,
 * HttpOnly CSRF `state` cookie and redirects to the Intuit consent screen.
 * The callback verifies the state before exchanging the code.
 */
export async function GET(req: NextRequest) {
  await requireVendor();
  if (!quickbooksConfigured()) {
    return new Response("quickbooks_not_configured", { status: 503 });
  }

  const origin = new URL(req.url).origin;
  const redirectUri =
    QUICKBOOKS_REDIRECT_URI ?? `${origin}/api/integrations/quickbooks/callback`;
  const state = randomBytes(16).toString("hex");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl(state, redirectUri),
      // 10-minute single-use CSRF token; Secure so it only rides HTTPS in prod.
      "Set-Cookie": `qbo_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${
        origin.startsWith("https") ? "; Secure" : ""
      }`,
    },
  });
}
