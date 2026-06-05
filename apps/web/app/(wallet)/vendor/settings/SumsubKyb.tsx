"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getKybTokenAction } from "./actions";

// The Sumsub WebSDK touches `window`, so load it client-only.
const SumsubWebSdk = dynamic(() => import("@sumsub/websdk-react"), {
  ssr: false,
});

/**
 * KYB verification launcher. Shows the vendor's current Sumsub status and, when
 * they start, mints a fresh WebSDK access token (server action) and embeds the
 * Sumsub flow. On completion the daemon's screening worker reads the result by
 * externalUserId (= vendor id) at settle time.
 */
export function SumsubKyb({
  status,
}: {
  status: "verified" | "rejected" | "pending" | "none" | "error";
}) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setErr(null);
    try {
      const r = await getKybTokenAction();
      setToken(r.token);
    } catch (e) {
      setErr(
        (e as Error).message === "kyb_not_configured"
          ? "KYB is not configured on this environment."
          : "Couldn't start verification — please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (token) {
    return (
      <div className="px-6 py-4">
        <SumsubWebSdk
          accessToken={token}
          expirationHandler={async () => (await getKybTokenAction()).token}
          config={{ lang: "en" }}
          options={{ addViewportTag: false, adaptIframeHeight: true }}
          onMessage={() => {}}
          onError={() => {}}
        />
      </div>
    );
  }

  const tone =
    status === "verified" ? "live" : status === "rejected" ? "danger" : "neutral";
  const label =
    status === "verified"
      ? "Verified"
      : status === "rejected"
        ? "Rejected"
        : status === "pending"
          ? "In review"
          : "Not started";

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div className="flex items-center gap-3">
        <Badge tone={tone}>{label}</Badge>
        <span className="text-sm text-[var(--color-ink-muted)]">
          {status === "verified"
            ? "Your business is verified — payments clear the KYB check."
            : status === "pending"
              ? "Verification submitted — we'll update this when Sumsub completes."
              : "Verify your business so settled payments clear the KYB check."}
        </span>
      </div>
      {status !== "verified" && status !== "pending" && (
        <Button onClick={start} disabled={loading} size="sm">
          {loading ? "Starting…" : status === "rejected" ? "Re-verify →" : "Verify business →"}
        </Button>
      )}
      {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}
    </div>
  );
}
