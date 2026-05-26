"use client";

// App Router needs a top-level
// global-error.tsx for React render errors to reach Sentry. Without this,
// errors that escape route-level error.tsx boundaries fall through to a
// blank screen + are not reported. Captures the error + renders a minimal
// fallback so the user has somewhere to go.

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          background: "#FAFAF7",
          color: "#0A0A0A",
          padding: "5rem 1.5rem",
          textAlign: "center",
          minHeight: "100vh",
        }}
      >
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#8a8a87",
          }}
        >
          Klaro · Error
        </p>
        <h1
          style={{ fontSize: "1.75rem", fontWeight: 600, marginTop: "0.75rem" }}
        >
          Something broke on our side.
        </h1>
        <p
          style={{
            marginTop: "0.75rem",
            color: "#525252",
            maxWidth: 480,
            marginInline: "auto",
          }}
        >
          Our team was notified. Try again in a minute, or head back to the
          dashboard.
        </p>
        {error.digest ? (
          <p
            style={{
              marginTop: "1.25rem",
              fontFamily: "monospace",
              fontSize: 11,
              color: "#8a8a87",
            }}
          >
            Reference: {error.digest}
          </p>
        ) : null}
        <Link
          href="/vendor"
          style={{
            display: "inline-block",
            marginTop: "2rem",
            padding: "0.625rem 1.5rem",
            background: "#0A0A0A",
            color: "#fff",
            borderRadius: 999,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Back to dashboard
        </Link>
      </body>
    </html>
  );
}
