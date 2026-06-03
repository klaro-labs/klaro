"use client";

import { useState } from "react";

interface AgentLite {
  agentId: string;
  displayName: string;
  pricePerCallUsdc: string;
}

type Phase =
  | "idle"
  | "calling"
  | "402"
  | "signing"
  | "retrying"
  | "ok"
  | "error";

// Human-readable button labels for each in-flight phase — we never surface the
// raw state enum to users on this public demo.
const PHASE_LABEL: Partial<Record<Phase, string>> = {
  calling: "Calling agent…",
  "402": "Payment required…",
  signing: "Signing payment…",
  retrying: "Retrying with signature…",
};

export function X402DemoClient({ agents }: { agents: AgentLite[] }) {
  const [selected, setSelected] = useState(agents[0]?.agentId ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<string[]>([]);
  const [body, setBody] = useState<unknown>(null);

  function log(s: string) {
    setSteps((prev) => [...prev, s]);
  }

  async function run() {
    setPhase("calling");
    setSteps([]);
    setBody(null);
    try {
      log(`POST /api/agents/${selected}/call (no Payment-Signature)`);
      const first = await fetch(`/api/agents/${selected}/call`, {
        method: "POST",
      });
      if (first.status === 402) {
        setPhase("402");
        const offer = await first.json();
        log(`← 402 with ${offer.accepts.length} payment options`);
        log(
          `Selecting: ${offer.accepts[0].extra?.name ?? offer.accepts[0].scheme}`,
        );
        setPhase("signing");
        // Simulate the EIP-3009 signature payload — real path uses
        // BatchEvmScheme from @circle-fin/x402-batching/client.
        const payload = {
          accepted: offer.accepts[0],
          signature: "0x" + "ab".repeat(32),
          timestamp: Math.floor(Date.now() / 1000),
        };
        const header = btoa(JSON.stringify(payload));
        log("Signed EIP-3009 (zero gas)");
        setPhase("retrying");
        log("POST /api/agents/{id}/call WITH Payment-Signature");
        const second = await fetch(`/api/agents/${selected}/call`, {
          method: "POST",
          headers: { "payment-signature": header },
        });
        const result = await second.json();
        setBody(result);
        if (second.ok) {
          log(
            `← ${second.status} OK · mode=${result.mode} · auth=${result.authHash}`,
          );
          setPhase("ok");
        } else {
          setPhase("error");
        }
      } else {
        setBody(await first.json());
        setPhase("ok");
      }
    } catch (e) {
      log("ERR " + (e as Error).message);
      setPhase("error");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.2fr]">
      <div className="space-y-3 rounded-lg border border-[var(--color-line)] bg-white p-6">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[var(--color-ink-muted)]">Agent endpoint</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
          >
            {agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.displayName} · $
                {(Number(a.pricePerCallUsdc) / 1_000_000).toFixed(2)} / call
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={run}
          disabled={
            phase === "calling" || phase === "signing" || phase === "retrying"
          }
          className="w-full rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {PHASE_LABEL[phase] ?? "Call agent →"}
        </button>
      </div>

      <div className="rounded-lg border border-[var(--color-line)] bg-white p-6">
        <h2 className="font-display text-lg font-semibold">Flow</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          {steps.length === 0 ? (
            <li className="list-none text-[var(--color-ink-subtle)]">
              Press Call agent to start the flow.
            </li>
          ) : (
            steps.map((s, i) => (
              <li key={i} className="font-mono text-xs">
                {s}
              </li>
            ))
          )}
        </ol>
        {body !== null && (
          <pre className="mt-4 overflow-x-auto rounded bg-[var(--color-bg)] p-3 font-mono text-[11px]">
            {JSON.stringify(body, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
