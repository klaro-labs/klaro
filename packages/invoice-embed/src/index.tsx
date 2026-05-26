import { useEffect, useRef, useState } from "react";

export interface KlaroInvoiceEmbedProps {
  invoiceId: `0x${string}`;
  /** Defaults to https://i.klaro.so/[invoiceId]. */
  src?: string;
  /** Initial iframe height — auto-resizes via postMessage when Klaro hosted
   *  page reports its content height. Defaults to 720. */
  initialHeight?: number;
  /** Called when Klaro reports payment settled. */
  onSettled?: (payload: { invoiceId: string; receiptHash: string }) => void;
}

/** ALLOWED message origins. Strict allow-list to defeat XSS via postMessage. */
const ALLOWED_ORIGINS = new Set<string>([
  "https://i.klaro.so",
  "https://klaro.so",
]);

/**
 * <KlaroInvoiceEmbed invoiceId="0x..." /> drops the Klaro hosted invoice into
 * any page via iframe. Klaro hosts the wallet-connect + EIP-712 sign +
 * USDC approve + acceptAndPay flow — your page just provides the canvas.
 *
 * Receives two postMessage events from the hosted page (origin-checked):
 *   { type: "klaro:resize", height: number }
 *   { type: "klaro:settled", invoiceId, receiptHash }
 */
export function KlaroInvoiceEmbed({
  invoiceId,
  src,
  initialHeight = 720,
  onSettled,
}: KlaroInvoiceEmbedProps) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(initialHeight);

  const url = src ?? `https://i.klaro.so/${invoiceId}`;

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (!ALLOWED_ORIGINS.has(e.origin)) return;
      const d = e.data as {
        type?: string;
        height?: number;
        invoiceId?: string;
        receiptHash?: string;
      } | null;
      if (!d || typeof d.type !== "string") return;
      if (d.type === "klaro:resize" && typeof d.height === "number") {
        // Clamp to sane range so a malicious page can't blow up the DOM.
        setHeight(Math.max(200, Math.min(d.height, 4000)));
      }
      if (
        d.type === "klaro:settled" &&
        d.invoiceId &&
        d.receiptHash &&
        onSettled
      ) {
        onSettled({ invoiceId: d.invoiceId, receiptHash: d.receiptHash });
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onSettled]);

  return (
    <iframe
      ref={ref}
      src={url}
      title="Klaro invoice"
      sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
      referrerPolicy="strict-origin-when-cross-origin"
      style={{
        display: "block",
        width: "100%",
        height: `${height}px`,
        border: "1px solid var(--color-line, #E5E5E5)",
        borderRadius: 12,
        background: "#fff",
      }}
    />
  );
}
