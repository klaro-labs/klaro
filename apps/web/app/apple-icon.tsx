import { ImageResponse } from "next/og";
import { INK_HEX, BRAND_HEX } from "@/components/klaro/BrandMark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Apple touch icon — 3-rect K mark on warm-off-white, rounded corners.
 * iOS adds its own corner mask; the inner shape is what matters. The
 * inset preserves the brand mark proportions used in the designer SVG.
 */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#FAFAF7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="120"
        height="120"
        viewBox="0 0 24 24"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M4 2V22" stroke={INK_HEX} strokeWidth="4" />
        <path d="M5.5 12L19 2" stroke={BRAND_HEX} strokeWidth="4" />
        <path d="M5.5 12L19 22" stroke={BRAND_HEX} strokeWidth="4" />
      </svg>
    </div>,
    { ...size },
  );
}
