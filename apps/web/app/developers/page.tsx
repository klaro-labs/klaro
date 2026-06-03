import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { FinalCta } from "@/components/klaro/sections/FinalCta";
import { SectionHeader } from "@/components/klaro/SectionHeader";

export const metadata: Metadata = {
  title: "Developers · Klaro",
  description:
    "Klaro is developing an API-first integration surface: OpenAPI, TypeScript tooling, signed webhooks, and deterministic receipt verification.",
};

const SNIPPET_CREATE_INVOICE = `import { Klaro } from "@klaro/sdk";

const klaro = new Klaro({
  apiKey: process.env.KLARO_API_KEY,
  network: "arc-testnet",
});

const invoice = await klaro.invoices.create({
  customerId: "cust_acme",
  amountUsdc: "1250.00",
  dueAt: "2026-06-15",
  lineItems: [
    { description: "Q2 strategy retainer", amountUsdc: "1250.00" },
  ],
  privacyMode: "veiled", // anchor a keccak commit (M1); amount is still on-chain. Real hiding lands in v2.
});

console.log(invoice.hostedUrl); // → https://i.klaro.so/inv_…`;

const SNIPPET_WEBHOOK = `// Stripe-style HMAC SHA256 + 5-min replay window
import { verifyKlaroSignature } from "@klaro/sdk/webhooks";

export async function POST(req: Request) {
  const body = await req.text();
  const sig  = req.headers.get("klaro-signature")!;

  if (!verifyKlaroSignature(body, sig, process.env.KLARO_WEBHOOK_SECRET!)) {
    return new Response("bad signature", { status: 401 });
  }

  const event = JSON.parse(body);
  // event.type ∈ { invoice.settled, cashout.released, dispute.opened, … }
  return new Response("ok");
}`;

const SNIPPET_RECEIPT = `import { receiptHash, verifyReceipt } from "@klaro/sdk";

// Receipt hash is deterministic — same inputs always give the same bytes32.
const hash = receiptHash({
  invoiceId:      "0x…",
  invoiceHash:    "0x…",
  acceptanceHash: "0x…",
  screeningHash:  "0x…",
  settlementTx:   "0x…",
  vendor:         "0x…",
  sourceChainId:  5042002,
});

const ok = await verifyReceipt({ hash, network: "arc-testnet" });
console.log(ok); // true → on-chain AuditReceipt contract confirms the anchor`;

export default function DevelopersPage() {
  return (
    <main className="bg-[var(--color-bg-warm)] text-[var(--color-ink)]">
      <Nav />

      <section className="klaro-container w-full pt-24 pb-12">
        <SectionHeader
          eyebrow="Developers"
          title={
            <>
              Five minutes from{" "}
              <span className="text-[var(--color-brand)]">npm install</span> to
              a testnet invoice preview.
            </>
          }
          lede="This page documents the target developer experience. The current app supports the demo workflow; live SDK, webhook and on-chain receipt guarantees must be verified before integration use."
        />
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/api/openapi"
            className="inline-flex items-center justify-center rounded-full border border-[var(--color-ink)] bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Download OpenAPI spec
          </Link>
          <a
            href="https://www.npmjs.com/package/@klaro/sdk"
            className="inline-flex items-center justify-center rounded-full border border-[var(--color-ink)]/20 bg-white px-5 py-2.5 text-sm font-medium transition-colors hover:border-[var(--color-ink)]/40"
          >
            @klaro/sdk on npm
          </a>
          <Link
            href="/status"
            className="inline-flex items-center justify-center rounded-full border border-[var(--color-ink)]/20 bg-white px-5 py-2.5 text-sm font-medium transition-colors hover:border-[var(--color-ink)]/40"
          >
            API status
          </Link>
        </div>
      </section>

      <section className="klaro-container w-full py-12">
        <h2 className="font-display text-2xl font-semibold">
          Create an invoice
        </h2>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          The current hosted URL demonstrates the buyer flow. Cross-chain CCTP
          payment handling is a planned live integration.
        </p>
        <Snippet code={SNIPPET_CREATE_INVOICE} />
      </section>

      <section className="klaro-container w-full py-12">
        <h2 className="font-display text-2xl font-semibold">
          Receive webhooks
        </h2>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Target behavior: HMAC SHA256 signatures with a 5-minute replay window
          and an SDK verifier. Treat this as integration design until shipped.
        </p>
        <Snippet code={SNIPPET_WEBHOOK} />
      </section>

      <section className="klaro-container w-full py-12">
        <h2 className="font-display text-2xl font-semibold">
          Verify a receipt
        </h2>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Target behavior: compute a deterministic receipt hash and confirm an
          anchor against AuditReceipt once live settlement is enabled.
        </p>
        <Snippet code={SNIPPET_RECEIPT} />
      </section>

      <section className="klaro-container w-full py-20">
        <SectionHeader eyebrow="Reference" title="Everything else." />
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <RefCard
            title="REST API"
            body="Vendors · invoices · cashouts · disputes · fx · webhooks · receipts. All zod-validated."
            href="/api/openapi"
          />
          <RefCard
            title="Webhook events"
            body="Planned event surface: invoice.settled · cashout.released · dispute.opened · receipt.minted."
            href="/api/openapi"
          />
          <RefCard
            title="On-chain ABIs"
            body="abis/v1.0/*.json pinned per contract. Regenerated from forge build."
            href="https://github.com/klaro-labs/klaro"
          />
          <RefCard
            title="ERC-8183 reference"
            body="Agent job-settlement escrow. AgentEscrow.sol is the canonical implementation."
            href="https://github.com/klaro-labs/klaro"
          />
          <RefCard
            title="Postman collection"
            body="Import the OpenAPI spec → all endpoints with example requests + auth wired."
            href="/api/openapi"
          />
          <RefCard
            title="Status & SLA"
            body="status.klaro.so. Per-contract pause state. Partner outage feeds (Circle, Pyth)."
            href="/status"
          />
        </div>
      </section>

      <FinalCta />
      <Footer />
    </main>
  );
}

function Snippet({ code }: { code: string }) {
  return (
    <pre className="mt-6 overflow-x-auto rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-ink)] p-6 font-mono text-[13px] leading-relaxed text-white">
      <code>{code}</code>
    </pre>
  );
}

function RefCard({
  title,
  body,
  href,
}: {
  title: string;
  body: string;
  href: string;
}) {
  const isExternal = href.startsWith("http");
  const className =
    "rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6 transition-colors hover:border-[var(--color-brand)]/40";
  const content = (
    <>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-[var(--color-ink)]/80">{body}</p>
      <span className="mt-4 inline-block text-xs text-[var(--color-brand)]">
        Open →
      </span>
    </>
  );
  return isExternal ? (
    <a href={href} className={className} target="_blank" rel="noreferrer">
      {content}
    </a>
  ) : (
    <Link href={href as never} className={className}>
      {content}
    </Link>
  );
}
