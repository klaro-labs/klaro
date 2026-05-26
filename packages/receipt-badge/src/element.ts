/**
 * Zero-React web component fallback. Drop this script into any HTML page +
 * use `<klaro-receipt-badge receipt-hash="0x..."></klaro-receipt-badge>`.
 *
 * Same verify + render contract as the React export. Built entirely with
 * safe DOM methods (no innerHTML) + strict input validation so user-supplied
 * attributes can never inject script.
 */

const BASE_DEFAULT = "https://klaro.so/receipt";
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function safeBase(input: string | null): string {
  if (!input) return BASE_DEFAULT;
  try {
    const u = new URL(input);
    if (u.protocol !== "https:" && u.protocol !== "http:") return BASE_DEFAULT;
    return u.toString().replace(/\/$/, "");
  } catch {
    return BASE_DEFAULT;
  }
}

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

class KlaroReceiptBadge extends HTMLElement {
  connectedCallback() {
    const rawHash = this.getAttribute("receipt-hash") ?? "";
    const hash = HASH_RE.test(rawHash) ? rawHash : "";
    const base = safeBase(this.getAttribute("klaro-base"));
    const size = ((): "sm" | "md" | "lg" => {
      const s = this.getAttribute("size");
      return s === "sm" || s === "lg" ? s : "md";
    })();
    const dim = size === "sm" ? 24 : size === "lg" ? 56 : 36;
    const fontSize = size === "sm" ? 9 : size === "lg" ? 14 : 11;

    const root = this.attachShadow({ mode: "open" });

    const a = document.createElement("a");
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noreferrer noopener");
    if (hash) a.setAttribute("href", `${base}/${hash}`);
    a.style.cssText = `display:inline-flex;align-items:center;gap:6px;text-decoration:none;color:#0a0a0a;font-family:ui-sans-serif,system-ui,sans-serif;font-size:${fontSize}px;font-weight:500;`;

    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      width: String(dim),
      height: String(dim),
      "aria-hidden": "true",
    });
    svg.appendChild(
      svgEl("circle", {
        cx: "12",
        cy: "12",
        r: "11",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "1.5",
      }),
    );
    const check = svgEl("path", {
      d: "M7 12.5l3 3 7-7",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      opacity: "0.3",
    });
    svg.appendChild(check);

    const label = document.createElement("span");
    label.textContent = hash ? "Verifying…" : "Invalid receipt hash";

    a.appendChild(svg);
    a.appendChild(label);
    root.appendChild(a);

    if (!hash) return;

    fetch(`${base}/${hash}.json`)
      .then((r) => {
        if (r.ok) {
          label.textContent = "Verified · Klaro";
          check.setAttribute("opacity", "1");
          a.style.color = "#1B6BFF";
        } else if (r.status === 404) {
          label.textContent = "Klaro receipt missing";
        } else {
          label.textContent = "Verify failed";
        }
      })
      .catch(() => {
        label.textContent = "Verify failed";
      });
  }
}

if (
  typeof window !== "undefined" &&
  !customElements.get("klaro-receipt-badge")
) {
  customElements.define("klaro-receipt-badge", KlaroReceiptBadge);
}

export {};
