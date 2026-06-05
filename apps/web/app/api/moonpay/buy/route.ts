import { NextRequest } from "next/server";
import { buildMoonpayLink } from "@/lib/moonpay";
import { moonpayLive } from "@/lib/env";

/**
 * Card → USDC redirect. Buyer hits this from /i/[id] when they lack USDC.
 * P1 (#94): `redirect` was an open redirect — any
 * absolute URL would echo through to MoonPay's redirectURL param, letting
 * an attacker craft `www.myklaro.app/api/moonpay/buy?redirect=https://evil.com`
 * to phish vendors. Now restricted to same-origin paths.
 * `walletAddress` defaulted to
 * the zero address. In live mode (`moonpayLive()`) that meant the
 * buyer's card payment funded `0x000…0` — USDC minted, money lost,
 * no recovery. Reject with 400 when wallet is missing under live
 * mode. Simulator mode keeps the zero-address default so the demo
 * URL still resolves to MoonPay's sandbox UI.
 */
const ALLOWED_REDIRECT_HOSTS = new Set<string>([
  // additional partner hosts that may need to receive post-purchase callbacks
]);

// QA-044/045 consolidation: route same-origin path validation through the
// shared lib/safeRedirect helper so all 3 redirect call sites use one
// allow-list. Absolute-URL branch keeps the explicit partner-host allowlist.
import { resolveSafeRedirect } from "@/lib/safeRedirect";

function safeRedirectTarget(rawRedirect: string, origin: string): string {
  if (rawRedirect.startsWith("/")) {
    return resolveSafeRedirect(rawRedirect, origin, "/");
  }
  try {
    const u = new URL(rawRedirect);
    if (u.origin === origin || ALLOWED_REDIRECT_HOSTS.has(u.host)) {
      return u.toString();
    }
  } catch {
    /* not a URL — fall through */
  }
  return origin;
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const amount = Number(url.searchParams.get("amount") ?? 100);
  const rawRedirect = url.searchParams.get("redirect") ?? "/";
  const walletQuery = url.searchParams.get("wallet");

  if (moonpayLive()) {
    if (!walletQuery || !ADDR_RE.test(walletQuery)) {
      return new Response(
        JSON.stringify({
          error: "wallet_required",
          message:
            "wallet query parameter is required in live mode; refusing to redirect a card payment to the zero address",
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
  }

  const walletAddress =
    walletQuery && ADDR_RE.test(walletQuery)
      ? walletQuery
      : "0x0000000000000000000000000000000000000000";

  const link = buildMoonpayLink({
    walletAddress,
    amountUsdc: amount,
    redirectUrl: safeRedirectTarget(rawRedirect, url.origin),
  });

  return Response.redirect(link.url, 302);
}
