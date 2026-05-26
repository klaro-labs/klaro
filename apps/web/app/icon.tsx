import { ImageResponse } from "next/og";
import { INK_HEX, BRAND_HEX } from "@/components/klaro/BrandMark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon — 3-rect K mark on warm-off-white background.
 * Geometry mirrors `components/klaro/BrandMark.tsx` (source of truth
 * = `designer/brand-kit/index.html`). Viewbox scaled down to 22x22
 * inside the 32x32 canvas so the stem doesn't kiss the edge at tab size.
 */
export default function Icon() {
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
        width="24"
        height="24"
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
