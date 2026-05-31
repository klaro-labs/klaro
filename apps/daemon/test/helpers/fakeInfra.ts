/**
 * Test doubles for the daemon's infra boundary (Supabase, BullMQ queue/worker,
 * Arc chain client). Workers import these modules; tests `vi.mock` the modules
 * to return the fakes here so the *worker logic* (event→DB→chain ordering,
 * idempotency, call args) is exercised with no real infra. Mirrors the seam the
 * existing claimOnce / disputeRouting tests use.
 */

export interface SbCall {
  table: string;
  op: "select" | "update" | "upsert" | "insert" | "delete";
  payload?: unknown;
  filters: Array<{ kind: string; col: string; val: unknown }>;
}

type SbResult = { data?: unknown; error?: unknown };
type SbHandler = (call: SbCall) => SbResult;

/**
 * Chainable Supabase query-builder fake. `handlers[table]` decides the result
 * from the recorded call (inspect `call.op` / `call.filters` to branch). All
 * recorded calls land in `calls` for assertions. The builder is awaitable
 * (thenable) so both `await sb().from(t).update(x).eq(...)` and the terminal
 * `.single()` / `.maybeSingle()` forms resolve.
 */
export function makeSb(
  handlers: Record<string, SbHandler> = {},
  sink?: SbCall[],
) {
  // A worker calls sb() fresh per query, so tests pass a shared `sink` array to
  // accumulate calls across every sb() invocation in one worker run.
  const calls: SbCall[] = sink ?? [];
  function builder(table: string) {
    const call: SbCall = { table, op: "select", filters: [] };
    const resolve = (): SbResult => {
      calls.push(call);
      const h = handlers[table];
      return h ? h(call) : { data: null, error: null };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    const writeOps = new Set([
      "select",
      "update",
      "upsert",
      "insert",
      "delete",
    ]);
    const filterOps = new Set([
      "eq",
      "neq",
      "is",
      "in",
      "like",
      "ilike",
      "gt",
      "gte",
      "lt",
      "lte",
    ]);
    const passthrough = new Set(["order", "limit", "range", "returns"]);
    const allMethods = [...writeOps, ...filterOps, ...passthrough];
    for (const m of allMethods) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      b[m] = (...args: any[]) => {
        if (writeOps.has(m)) {
          call.op = m as SbCall["op"];
          if (m !== "select") call.payload = args[0];
        } else if (filterOps.has(m)) {
          call.filters.push({ kind: m, col: args[0], val: args[1] });
        }
        return b;
      };
    }
    b.single = async () => resolve();
    b.maybeSingle = async () => resolve();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR);
    return b;
  }
  const sb = () => ({ from: (t: string) => builder(t) });
  return { sb, calls };
}

export interface QueueAdd {
  queue: string;
  jobName: string;
  data: unknown;
  opts?: unknown;
}

/**
 * Captures `startWorker(name, processor)` registrations + every `queue(name).add()`.
 * Tests grab the processor for the worker under test and invoke it directly.
 */
export function makeQueue() {
  const adds: QueueAdd[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processors = new Map<string, (job: { data: any }) => Promise<void>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startWorker = (name: string, processor: any) => {
    processors.set(name, processor);
    return { name };
  };
  const queue = (name: string) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    add: async (jobName: string, data: any, opts?: any) => {
      adds.push({ queue: name, jobName, data, opts });
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (name: string, data: any) => {
    const p = processors.get(name);
    if (!p) throw new Error(`no worker registered for "${name}"`);
    return p({ data });
  };
  return { startWorker, queue, adds, processors, run };
}

/** Arc chain-client fake. `reads` maps functionName → return value; every
 * write/simulate is recorded. `simulateThrow` lets a test force a revert. */
export function makeArc(opts?: {
  reads?: Record<string, unknown>;
  hasWallet?: boolean;
  simulateThrow?: () => unknown;
}) {
  const reads = opts?.reads ?? {};
  const hasWallet = opts?.hasWallet ?? true;
  const writes: Array<{
    functionName: string;
    args: unknown[];
    address: string;
  }> = [];
  const simulations: Array<{ functionName: string; args: unknown[] }> = [];

  const account = { address: "0x00000000000000000000000000000000000000a1" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const publicClient: any = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readContract: async ({ functionName }: any) => {
      if (!(functionName in reads))
        throw new Error(`no read stub for ${functionName}`);
      return reads[functionName];
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    simulateContract: async ({ functionName, args }: any) => {
      simulations.push({ functionName, args });
      if (opts?.simulateThrow) throw opts.simulateThrow();
      return { request: {} };
    },
    waitForTransactionReceipt: async () => ({ status: "success", logs: [] }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletClient: any = {
    account,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeContract: async ({ functionName, args, address }: any) => {
      writes.push({ functionName, args, address });
      return "0xdeadbeef";
    },
  };
  const arcPublic = () => publicClient;
  const arcWallet = () => (hasWallet ? walletClient : null);
  const requireArcWalletInProd = (where: string) => {
    if (!hasWallet) throw new Error(`arcWallet_unavailable: ${where}`);
    return walletClient;
  };
  return { arcPublic, arcWallet, requireArcWalletInProd, writes, simulations };
}

/** No-op logger matching the daemon log surface. */
export const fakeLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};
