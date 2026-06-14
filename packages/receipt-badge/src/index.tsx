import { useEffect, useState } from "react";

export interface KlaroReceiptBadgeProps {
  /** 32-byte receipt hash to verify. */
  receiptHash: `0x${string}`;
  /** Klaro receipt URL prefix. Defaults to https://klaro.so/receipt. */
  klaroBase?: string;
  /** Size — "sm" 24px, "md" 36px (default), "lg" 56px. */
  size?: "sm" | "md" | "lg";
  /** Force a state for design previews. */
  forceState?: "verifying" | "verified" | "not-found";
}

type State = "verifying" | "verified" | "not-found" | "error";

/**
 * Drop-in receipt badge. Hits Klaro's public receipt API to verify the
 * receipt hash exists; renders a Klaro Proof seal that links to the full
 * public receipt page. Zero dependencies beyond React.
 */
export function KlaroReceiptBadge({
  receiptHash,
  klaroBase = "https://klaro.so/receipt",
  size = "md",
  forceState,
}: KlaroReceiptBadgeProps) {
  const [state, setState] = useState<State>(forceState ?? "verifying");

  useEffect(() => {
    if (forceState) return;
    let cancelled = false;
    fetch(`${klaroBase}/${receiptHash}.json`)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setState("verified");
        else if (r.status === 404) setState("not-found");
        else setState("error");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [receiptHash, klaroBase, forceState]);

  const dim = size === "sm" ? 24 : size === "lg" ? 56 : 36;
  const fontSize = size === "sm" ? 9 : size === "lg" ? 14 : 11;

  const color =
    state === "verified"
      ? "#1B6BFF"
      : state === "not-found"
        ? "#737373"
        : state === "error"
          ? "#B91C1C"
          : "#0a0a0a";

  return (
    <a
      href={`${klaroBase}/${receiptHash}`}
      target="_blank"
      rel="noreferrer"
      title={
        state === "verified"
          ? "Verified Klaro receipt on Arc"
          : state === "not-found"
            ? "Klaro receipt not found"
            : state === "error"
              ? "Could not verify Klaro receipt"
              : "Verifying Klaro receipt…"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        textDecoration: "none",
        color,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize,
        fontWeight: 500,
      }}
    >
      <svg viewBox="0 0 24 24" width={dim} height={dim} aria-hidden>
        <circle
          cx="12"
          cy="12"
          r="11"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
        />
        <path
          d="M7 12.5l3 3 7-7"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={state === "verified" ? 1 : 0.3}
        />
      </svg>
      <span>
        {state === "verified"
          ? "Verified · Klaro"
          : state === "not-found"
            ? "Klaro receipt missing"
            : state === "error"
              ? "Verify failed"
              : "Verifying…"}
      </span>
    </a>
  );
}
