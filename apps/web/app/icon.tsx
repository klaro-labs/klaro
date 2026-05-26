import { ImageResponse } from "next/og";
import { INK_HEX, BRAND_HEX } from "@/components/klaro/BrandMark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon. Solid K-arrow on warm-off-white. Geometry mirrors BrandMark.
 * Transparent-friendly fill so the mark holds on both light + dark tabs.
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
        width="26"
        height="26"
        viewBox="0 0 24 24"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="2" y="2" width="4.5" height="20" rx="0.5" fill={INK_HEX} />
        <path d="M6.5 12 L20 2 L20 6.5 L11.5 12 Z" fill={BRAND_HEX} />
        <path d="M6.5 12 L20 22 L20 17.5 L11.5 12 Z" fill={BRAND_HEX} />
      </svg>
    </div>,
    { ...size },
  );
}
