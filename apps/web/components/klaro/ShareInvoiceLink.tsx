"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckIcon } from "@/components/ui/CheckIcon";

/** Copy-to-clipboard for the hosted invoice URL. Audit fix (loop iter 13):
 * vendor detail previously had just a `<Link>` — no copy affordance — so
 * the most common workflow (paste into email/chat) required manual select. */
export function ShareInvoiceLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Browser blocked clipboard or non-https; fall back to old-school select.
      const tmp = document.createElement("input");
      tmp.value = url;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      document.body.removeChild(tmp);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={copy}>
      {copied ? (
        <>
          <CheckIcon className="size-4" /> Copied
        </>
      ) : (
        "Copy link"
      )}
    </Button>
  );
}
