import { ImageResponse } from "next/og";
import { INK_HEX, BRAND_HEX } from "@/components/klaro/BrandMark";

/** PWA icon — 192×192. Audit fix (loop iter 16, 2026-05-25): `sw.js` push
 * notifications referenced `/icon-192.png` but no file existed → notifications
 * shipped with the browser-default app icon. Next.js renders this dynamic
 * route at `/icon0` per the icon0 convention; manifest entry is added below.
 * Mirrors `app/icon.tsx` brand geometry. */
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon192() {
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
        width="128"
        height="128"
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
