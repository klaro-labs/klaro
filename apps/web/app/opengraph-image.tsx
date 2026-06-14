import { ImageResponse } from "next/og";
import { INK_HEX, BRAND_HEX } from "@/components/klaro/BrandMark";

export const alt =
  "Klaro — Arc-native USDC invoicing, receipts, and INR cashout";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        background: "linear-gradient(135deg, #FAFAF7 0%, #EAF1FF 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg
          width="56"
          height="56"
          viewBox="0 0 24 24"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M4 2V22" stroke={INK_HEX} strokeWidth="4" />
          <path d="M5.5 12L19 2" stroke={BRAND_HEX} strokeWidth="4" />
          <path d="M5.5 12L19 22" stroke={BRAND_HEX} strokeWidth="4" />
        </svg>
        <div
          style={{
            display: "flex",
            fontSize: 44,
            fontWeight: 600,
            color: "#0A0A0A",
            letterSpacing: "-0.02em",
          }}
        >
          klaro
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: "#0A0A0A",
            lineHeight: 1.05,
          }}
        >
          Get paid in USDC. Cash out in INR.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#444",
            maxWidth: 900,
          }}
        >
          Arc-native invoicing with Klaro Proof receipts. Built for global SMB
          vendors.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 20,
          color: "#666",
          borderTop: "1px solid #D0D5DD",
          paddingTop: 24,
        }}
      >
        <span>www.myklaro.app</span>
        <span>Testnet preview · No real money moves</span>
      </div>
    </div>,
    { ...size },
  );
}
