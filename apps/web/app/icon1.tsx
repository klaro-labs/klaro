import { ImageResponse } from "next/og";
import { INK_HEX, BRAND_HEX } from "@/components/klaro/BrandMark";

/** PWA icon — 512×512. Required by Lighthouse PWA + Android "Add to home
 * screen" splash. Mirrors brand geometry. */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon512() {
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
        width="340"
        height="340"
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
