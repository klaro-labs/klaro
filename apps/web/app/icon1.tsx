import { ImageResponse } from "next/og";
import { INK_HEX, BRAND_HEX } from "@/components/klaro/BrandMark";

/** PWA icon (512×512). Required for Android "Add to home screen" splash
 * and Lighthouse PWA score. Mirrors BrandMark geometry. */
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
        width="370"
        height="370"
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
