/**
 * In-process mock data store. Used as the fallback when `SUPABASE_URL` is
 * unset (local development, preview branches without env wiring). All vendor
 * and invoice reads / writes go through this stub so the UI exercises the
 * same shape it uses against Postgres.
 *
 * Honest mode boundary: every function name carries a `mock` prefix and
 * every UI surface tags data as `testnet · simulated` when read from here.
 * Live and mock data are never silently mixed.
 */
import type {
  Invoice,
  Vendor,
  VendorBalances,
  Hex,
  InvoiceStatus,
  CashoutOrder,
  CashoutStatus,
  CashoutTimelineEvent,
} from "./types";

// USDC on Arc ERC-20 interface = 6 decimals. Native is 18 (gas only), but
// Klaro reads/writes only via the ERC-20 interface — see lib/money.ts.
const ONE_USDC = 10n ** 6n;
const DEMO_VENDOR_WALLET: Hex = "0x7a3c1f9f9a8d1e2c4b9a8d6c4b3a2e1d0c9b8a7f";

type SharedDemoState = typeof globalThis & {
  __klaroVendors?: Map<string, Vendor>;
  __klaroInvoices?: Map<Hex, Invoice>;
  __klaroCashouts?: Map<Hex, CashoutOrder>;
  __klaroDisputes?: Map<Hex, DisputeCase>;
};

// Server actions and React server routes are separately bundled by Next.js.
// Keep simulator records in one process-level store so a record created in an
// action is visible when the next page renders it.
const sharedDemo = globalThis as SharedDemoState;
const _vendors = (sharedDemo.__klaroVendors ??= new Map<string, Vendor>());
const _invoices = (sharedDemo.__klaroInvoices ??= new Map<Hex, Invoice>());

// Seed one demo vendor + 3 invoices so dashboard renders something on first visit.
{
  const seedVendor: Vendor = {
    id: "vendor-asha",
    email: "asha@klaro.demo",
    displayName: "Asha Pune",
    country: "IN",
    wallet: DEMO_VENDOR_WALLET,
    createdAt: new Date("2026-05-01T08:30:00Z"),
    brandColor: "#1B6BFF",
    invoiceTemplateVersion: 1,
  };
  if (!_vendors.has(seedVendor.id)) _vendors.set(seedVendor.id, seedVendor);

  const seed = (
    id: Hex,
    amount: bigint,
    status: InvoiceStatus,
    description: string,
    customerEmail: string,
  ): Invoice => ({
    id,
    vendorId: seedVendor.id,
    vendorWallet: seedVendor.wallet,
    token: "0x3600000000000000000000000000000000000000", // USDC on Arc
    amount,
    dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    status,
    customer: { email: customerEmail, name: customerEmail.split("@")[0] },
    lineItems: [{ description, amount }],
    metadataHash: ("0x" + "ab".repeat(32)) as Hex,
    createdAt: new Date(),
  });

  // Stable bytes32 seed ids (66 chars total: 0x + 64 hex).
  const SEED_SETTLED =
    "0xc107d300000000000000000000000000000000000000000000000000000e000" as Hex;
  const SEED_PAID =
    "0xc107d300000000000000000000000000000000000000000000000000000e001" as Hex;
  const SEED_CREATED =
    "0xc107d300000000000000000000000000000000000000000000000000000e002" as Hex;
  // Pad to 64 hex chars by appending zeros to the right.
  const pad = (h: Hex): Hex =>
    h.length === 66 ? h : ((h + "0".repeat(66 - h.length)) as Hex);

  const id1 = pad(SEED_SETTLED);
  const id2 = pad(SEED_PAID);
  const id3 = pad(SEED_CREATED);

  if (!_invoices.has(id1)) {
    _invoices.set(
      id1,
      seed(
        id1,
        4_200n * ONE_USDC,
        "SETTLED",
        "Backend dev — Week 17 sprint",
        "client@nyc-saas.demo",
      ),
    );
  }
  if (!_invoices.has(id2)) {
    _invoices.set(
      id2,
      seed(
        id2,
        1_800n * ONE_USDC,
        "PAID",
        "API audit · scope phase",
        "ops@frankfurt-startup.demo",
      ),
    );
  }
  if (!_invoices.has(id3)) {
    _invoices.set(
      id3,
      seed(
        id3,
        950n * ONE_USDC,
        "CREATED",
        "Code review — onboarding flow",
        "team@london-fintech.demo",
      ),
    );
  }
}

// ─── Public mock API ──────────────────────────────────────────────────

export async function mockGetCurrentVendor(): Promise<Vendor | null> {
  // For M3, "current" = the seeded vendor. M4 wires Supabase auth session.
  return _vendors.get("vendor-asha") ?? null;
}

export async function mockListInvoices(vendorId: string): Promise<Invoice[]> {
  return [..._invoices.values()]
    .filter((i) => i.vendorId === vendorId)
    .sort((a, b) => +b.createdAt - +a.createdAt);
}

/// the lifecycle-reminder cron used
/// to filter to "vendor-asha" only, so the per-vendor name cache added in
/// was single-element by construction. Live mode (Supabase) walks
/// every vendor's invoices; the simulator path must match that shape so
/// the cron's logic gets exercised the same way both sides.
export async function mockListAllInvoices(): Promise<Invoice[]> {
  return [..._invoices.values()].sort((a, b) => +b.createdAt - +a.createdAt);
}

export async function mockGetInvoice(id: Hex): Promise<Invoice | null> {
  return _invoices.get(id) ?? null;
}

export async function mockCreateInvoice(
  input: Omit<Invoice, "id" | "createdAt" | "metadataHash" | "status"> &
    Partial<Pick<Invoice, "id" | "metadataHash">>,
): Promise<Invoice> {
  const id = (input.id ??
    "0x" +
      Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64)) as Hex;
  const metadataHash = (input.metadataHash ?? "0x" + "cd".repeat(32)) as Hex;
  const invoice: Invoice = {
    ...input,
    id,
    status: "CREATED",
    metadataHash,
    createdAt: new Date(),
  };
  _invoices.set(id, invoice);
  return invoice;
}

/** Mutate the status of a mock invoice (used by repo fallback path). */
export async function mockAdvanceInvoiceStatus(
  id: Hex,
  status: Invoice["status"],
): Promise<void> {
  const inv = _invoices.get(id);
  if (!inv) return;
  inv.status = status;
}

export function mockComputeBalances(
  invoices: Invoice[],
  cashouts: CashoutOrder[] = [],
): VendorBalances {
  const sumI = (filter: (i: Invoice) => boolean) =>
    invoices.filter(filter).reduce((acc, i) => acc + i.amount, 0n);
  const sumC = (filter: (c: CashoutOrder) => boolean) =>
    cashouts.filter(filter).reduce((acc, c) => acc + c.usdcAmount, 0n);

  const settled = sumI((i) => i.status === "SETTLED");
  // Locked = currently in a non-terminal cashout (LOCKED / CLAIMED / PROOF_SUBMITTED)
  const locked = sumC((c) =>
    ["LOCKED", "CLAIMED", "PROOF_SUBMITTED"].includes(c.status),
  );
  // Held = open dispute
  const held = sumC((c) => c.status === "DISPUTED");
  // Available = settled - locked - held - released-already
  const released = sumC((c) =>
    ["RELEASED", "RESOLVED_LP_PAYS"].includes(c.status),
  );
  const available = settled - locked - held - released;

  return {
    available: available > 0n ? available : 0n,
    pending: sumI((i) => i.status === "PAID"),
    locked,
    held,
    cashoutable: available > 0n ? available : 0n,
    simulated: settled,
  };
}

// ─── Cashout orders ───────────────────────────────────────────────────

const _cashouts = (sharedDemo.__klaroCashouts ??= new Map<Hex, CashoutOrder>());

export async function mockListCashouts(
  vendorId: string,
): Promise<CashoutOrder[]> {
  return [..._cashouts.values()]
    .filter((c) => c.vendorId === vendorId)
    .sort((a, b) => +b.requestedAt - +a.requestedAt);
}

export async function mockGetCashout(id: Hex): Promise<CashoutOrder | null> {
  return _cashouts.get(id) ?? null;
}

export async function mockCreateCashout(
  input: Omit<CashoutOrder, "id" | "status" | "requestedAt" | "timeline">,
): Promise<CashoutOrder> {
  const id = ("0x" +
    Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64)) as Hex;
  const now = new Date();
  const order: CashoutOrder = {
    ...input,
    id,
    status: "LOCKED",
    requestedAt: now,
    timeline: [
      { kind: "locked", at: now, detail: "Demo cashout order created" },
    ],
  };
  _cashouts.set(id, order);
  return order;
}

/** Advance a mock cashout through the next step (used by simulator). */
export async function mockAdvanceCashout(
  id: Hex,
  to: CashoutStatus,
  event: CashoutTimelineEvent,
  patch?: Partial<CashoutOrder>,
  requireFromStatus?: CashoutStatus,
): Promise<CashoutOrder | null> {
  const c = _cashouts.get(id);
  if (!c) return null;
  // TOCTOU close: caller-asserted prior status. Lost-race returns
  // null so the caller can re-read + report; mirrors the Supabase atomic
  // .eq("status", priorStatus) path.
  if (requireFromStatus !== undefined && c.status !== requireFromStatus) {
    return null;
  }
  c.status = to;
  c.timeline.push(event);
  if (patch) Object.assign(c, patch);
  return c;
}

// ─── M7 stores: recurring · webhooks · bills ────────────────────────────

export interface RecurringSchedule {
  id: string;
  vendorId: string;
  customerEmail: string;
  amountUsdc: bigint;
  description: string;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly";
  nextRunAt: Date;
  active: boolean;
  createdAt: Date;
}
const _recurring = new Map<string, RecurringSchedule>();

export async function mockListRecurring(
  vendorId: string,
): Promise<RecurringSchedule[]> {
  return [..._recurring.values()]
    .filter((r) => r.vendorId === vendorId)
    .sort((a, b) => +b.createdAt - +a.createdAt);
}
export async function mockCreateRecurring(
  input: Omit<RecurringSchedule, "id" | "createdAt" | "active">,
): Promise<RecurringSchedule> {
  const id = `rec_${Math.random().toString(36).slice(2, 10)}`;
  const r: RecurringSchedule = {
    id,
    active: true,
    createdAt: new Date(),
    ...input,
  };
  _recurring.set(id, r);
  return r;
}

export interface WebhookEndpoint {
  id: string;
  vendorId: string;
  url: string;
  events: string[];
  signingSecret: string;
  active: boolean;
  createdAt: Date;
  lastDeliveryAt?: Date;
  lastStatus?: "ok" | "fail";
}
const _webhooks = new Map<string, WebhookEndpoint>();

export async function mockGetWebhook(
  id: string,
): Promise<WebhookEndpoint | null> {
  return _webhooks.get(id) ?? null;
}
export async function mockListWebhooks(
  vendorId: string,
): Promise<WebhookEndpoint[]> {
  return [..._webhooks.values()]
    .filter((w) => w.vendorId === vendorId)
    .sort((a, b) => +b.createdAt - +a.createdAt);
}
export async function mockCreateWebhook(input: {
  vendorId: string;
  url: string;
  events: string[];
}): Promise<WebhookEndpoint> {
  const id = `wh_${Math.random().toString(36).slice(2, 10)}`;
  // 32-byte hex signing secret. Vendors copy this once at creation.
  const signingSecret =
    "whsec_" +
    Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const w: WebhookEndpoint = {
    id,
    signingSecret,
    active: true,
    createdAt: new Date(),
    ...input,
  };
  _webhooks.set(id, w);
  return w;
}
export async function mockRecordWebhookDelivery(
  id: string,
  status: "ok" | "fail",
): Promise<void> {
  const w = _webhooks.get(id);
  if (!w) return;
  w.lastDeliveryAt = new Date();
  w.lastStatus = status;
}

export interface Bill {
  id: string;
  vendorId: string;
  fromEmail: string;
  fromName: string;
  amountUsdc: bigint;
  description: string;
  dueAt: Date;
  status: "received" | "scheduled" | "paid" | "rejected";
  createdAt: Date;
}
const _bills = new Map<string, Bill>();

export async function mockListBills(vendorId: string): Promise<Bill[]> {
  return [..._bills.values()]
    .filter((b) => b.vendorId === vendorId)
    .sort((a, b) => +b.createdAt - +a.createdAt);
}

// ─── M8 LP applications + KYB workflow ───────────────────────────────────

export type LPApplicationStatus =
  | "INVITED" // operator sent magic link, LP hasn't started
  | "DRAFT" // form opened, not submitted
  | "DOCS_UPLOADED" // KYB docs submitted, awaiting review
  | "UNDER_REVIEW" // operator-side review
  | "APPROVED" // KYB passed, can stake
  | "STAKED" // collateral posted, ready to claim
  | "REJECTED"
  | "SUSPENDED"
  | "REVOKED";

export interface LPApplication {
  lpId: string; // bytes32 hex when registered on-chain
  inviteCode: string; // short URL token
  legalEntityName?: string;
  contactEmail: string;
  country?: string;
  wallet?: Hex;
  tier: 0 | 1 | 2 | 3 | 4;
  stakedUsdc: bigint; // 0 until STAKED
  kybDocsHash?: Hex; // populated when docs upload step completes
  payoutAccountHash?: Hex;
  status: LPApplicationStatus;
  rejectReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const _lps = new Map<string, LPApplication>();

// Seed one LP partway through onboarding so the dashboard renders something.
{
  const seedId = "lp_mudrex_in_demo";
  _lps.set(seedId, {
    lpId: seedId,
    inviteCode: "klaro-lp-aakash-9f3e",
    legalEntityName: "Mudrex Pvt Ltd",
    contactEmail: "aakash@mudrex.in",
    country: "IN",
    wallet: "0xaa3c1f9f9a8d1e2c4b9a8d6c4b3a2e1d0c9b8a01" as Hex,
    tier: 2,
    stakedUsdc: 500n * 10n ** 6n,
    kybDocsHash: ("0x" + "ab".repeat(32)) as Hex,
    payoutAccountHash: ("0x" + "cd".repeat(32)) as Hex,
    status: "STAKED",
    createdAt: new Date("2026-04-12T09:00:00Z"),
    updatedAt: new Date("2026-04-18T14:32:00Z"),
  });
}

/** Maps vendor → LP. Audit finding #1 (2026-05-25). Seeded so the demo
 * vendor `vendor-asha` is treated as `owner` of the seeded LP, mirroring the
 * live-mode `lp_members` row. Without this every LP action picked the first
 * LP in the table for ANY signed-in vendor. */
export interface LPMembership {
  vendorId: string;
  lpId: string;
  role: "owner" | "operator" | "viewer";
}
const _lpMembers: LPMembership[] = [
  { vendorId: "vendor-asha", lpId: "lp_mudrex_in_demo", role: "owner" },
];

export async function mockListLpMembershipsForVendor(
  vendorId: string,
): Promise<LPMembership[]> {
  return _lpMembers.filter((m) => m.vendorId === vendorId);
}
export async function mockGetPrimaryLpForVendor(
  vendorId: string,
): Promise<LPApplication | null> {
  const m = _lpMembers.find((x) => x.vendorId === vendorId);
  if (!m) return null;
  return _lps.get(m.lpId) ?? null;
}
export async function mockGrantLpMembership(
  input: LPMembership,
): Promise<void> {
  if (
    !_lpMembers.find(
      (x) => x.vendorId === input.vendorId && x.lpId === input.lpId,
    )
  ) {
    _lpMembers.push(input);
  }
}

export async function mockListLPs(): Promise<LPApplication[]> {
  return [..._lps.values()].sort((a, b) => +b.createdAt - +a.createdAt);
}
export async function mockGetLPByInvite(
  code: string,
): Promise<LPApplication | null> {
  return [..._lps.values()].find((l) => l.inviteCode === code) ?? null;
}
export async function mockGetLP(id: string): Promise<LPApplication | null> {
  return _lps.get(id) ?? null;
}
export async function mockCreateLPInvite(input: {
  contactEmail: string;
}): Promise<LPApplication> {
  const lpId = `lp_${Math.random().toString(36).slice(2, 10)}`;
  const inviteCode = `klaro-lp-${Math.random().toString(36).slice(2, 8)}`;
  const lp: LPApplication = {
    lpId,
    inviteCode,
    contactEmail: input.contactEmail,
    tier: 0,
    stakedUsdc: 0n,
    status: "INVITED",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  _lps.set(lpId, lp);
  return lp;
}
export async function mockUpdateLP(
  lpId: string,
  patch: Partial<LPApplication>,
): Promise<LPApplication | null> {
  const lp = _lps.get(lpId);
  if (!lp) return null;
  Object.assign(lp, patch, { updatedAt: new Date() });
  return lp;
}

/** Pending orders queue rendered on lp/queue. Pulls REQUESTED/LOCKED cashouts
 * any active LP could potentially claim. */
export async function mockListClaimableCashouts(): Promise<CashoutOrder[]> {
  return [..._cashouts.values()]
    .filter((c) => c.status === "LOCKED")
    .sort((a, b) => +a.requestedAt - +b.requestedAt);
}

// ─── M8 team RBAC + session-key delegations ─────────────────────────────

export type TeamRole = "Owner" | "Admin" | "Member" | "ReadOnly";

export interface TeamMember {
  id: string;
  vendorId: string;
  email: string;
  role: TeamRole;
  status: "ACTIVE" | "INVITED" | "REMOVED";
  invitedAt: Date;
  acceptedAt?: Date;
}
const _team = new Map<string, TeamMember>();

// Seed the demo vendor's owner row
_team.set("tm_owner_demo", {
  id: "tm_owner_demo",
  vendorId: "vendor-asha",
  email: "asha@klaro.demo",
  role: "Owner",
  status: "ACTIVE",
  invitedAt: new Date("2026-04-01T10:00:00Z"),
  acceptedAt: new Date("2026-04-01T10:00:01Z"),
});

export async function mockListTeam(vendorId: string): Promise<TeamMember[]> {
  return [..._team.values()]
    .filter((t) => t.vendorId === vendorId && t.status !== "REMOVED")
    .sort((a, b) => +a.invitedAt - +b.invitedAt);
}
export async function mockInviteTeammate(input: {
  vendorId: string;
  email: string;
  role: TeamRole;
}): Promise<TeamMember> {
  const id = `tm_${Math.random().toString(36).slice(2, 10)}`;
  const m: TeamMember = {
    id,
    vendorId: input.vendorId,
    email: input.email,
    role: input.role,
    status: "INVITED",
    invitedAt: new Date(),
  };
  _team.set(id, m);
  return m;
}
export async function mockChangeTeamRole(
  id: string,
  role: TeamRole,
): Promise<TeamMember | null> {
  const m = _team.get(id);
  if (!m) return null;
  m.role = role;
  return m;
}
export async function mockRemoveTeammate(id: string): Promise<void> {
  const m = _team.get(id);
  if (m) m.status = "REMOVED";
}

export interface SessionKey {
  id: string;
  vendorId: string;
  delegateAddress: Hex;
  label: string; // human-readable: "Accounting · Stripe payouts"
  scope: SessionScope;
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date;
}
export type SessionScope =
  | "INVOICES_CREATE" // create + send invoices only
  | "INVOICES_SETTLE" // include settle authority
  | "CASHOUT_REQUEST" // open cashout requests
  | "READ_ONLY"; // dashboard view, no writes

const _sessionKeys = new Map<string, SessionKey>();

export async function mockListSessionKeys(
  vendorId: string,
): Promise<SessionKey[]> {
  return [..._sessionKeys.values()]
    .filter((s) => s.vendorId === vendorId && !s.revokedAt)
    .sort((a, b) => +b.createdAt - +a.createdAt);
}
export async function mockCreateSessionKey(input: {
  vendorId: string;
  delegateAddress: Hex;
  label: string;
  scope: SessionScope;
  ttlHours: number;
}): Promise<SessionKey> {
  const id = `sk_${Math.random().toString(36).slice(2, 10)}`;
  const k: SessionKey = {
    id,
    vendorId: input.vendorId,
    delegateAddress: input.delegateAddress,
    label: input.label,
    scope: input.scope,
    expiresAt: new Date(Date.now() + input.ttlHours * 3_600_000),
    createdAt: new Date(),
  };
  _sessionKeys.set(id, k);
  return k;
}
export async function mockGetSessionKey(
  id: string,
): Promise<SessionKey | null> {
  return _sessionKeys.get(id) ?? null;
}
export async function mockRevokeSessionKey(id: string): Promise<void> {
  const k = _sessionKeys.get(id);
  if (k) k.revokedAt = new Date();
}

// ─── M9 disputes ─────────────────────────────────────────────────────────

export type DisputeStatus =
  | "OPENED"
  | "EVIDENCE_REQUESTED"
  | "EVIDENCE_SUBMITTED"
  | "UNDER_REVIEW"
  | "DECIDED";

export type DisputeOutcome =
  | "RELEASE_TO_CLAIMANT"
  | "REFUND_TO_RESPONDENT"
  | "SLASH_LP"
  | "PENALIZE_VENDOR"
  | "MUTUAL_RESOLVED";

export type DisputeContext = "cashout" | "invoice" | "agent" | "stream";

export interface DisputeEvidenceItem {
  by: "claimant" | "respondent" | "operator";
  at: Date;
  note: string;
  hash: Hex;
}

export interface DisputeCase {
  caseId: Hex; // mirrors on-chain bytes32
  context: DisputeContext;
  contextRefId: Hex; // cashoutId / invoiceId / streamId
  vendorId: string; // for vendor-side surface filtering
  claimantLabel: string; // human-readable: "Asha Pune (vendor)"
  respondentLabel: string; // "Mudrex Pvt Ltd (LP)"
  amountUsdc: bigint;
  openingNote: string;
  status: DisputeStatus;
  outcome?: DisputeOutcome;
  decisionNote?: string;
  decisionReasonHash?: Hex;
  evidence: DisputeEvidenceItem[];
  openedAt: Date;
  updatedAt: Date;
  decidedAt?: Date;
}

const _disputes = (sharedDemo.__klaroDisputes ??= new Map<Hex, DisputeCase>());

// Seed one in-flight dispute so the admin queue and vendor list render
{
  const caseId = ("0xd1d1" + "0".repeat(60)) as Hex;
  if (!_disputes.has(caseId))
    _disputes.set(caseId, {
      caseId,
      context: "cashout",
      contextRefId: ("0xc1c1" + "0".repeat(60)) as Hex,
      vendorId: "vendor-asha",
      claimantLabel: "Asha Pune (vendor)",
      respondentLabel: "Mudrex Pvt Ltd (LP)",
      amountUsdc: 24_000_000n,
      openingNote:
        "LP submitted screenshot but no INR landed in my account after 4 hours. Bank confirms no incoming transfer.",
      status: "UNDER_REVIEW",
      evidence: [
        {
          by: "claimant",
          at: new Date("2026-05-22T14:30:00Z"),
          note: "Bank statement screenshot (no transfer)",
          hash: ("0xev01" + "0".repeat(60)) as Hex,
        },
        {
          by: "respondent",
          at: new Date("2026-05-22T16:10:00Z"),
          note: "LP's UPI screenshot + UTR reference",
          hash: ("0xev02" + "0".repeat(60)) as Hex,
        },
        {
          by: "operator",
          at: new Date("2026-05-23T09:00:00Z"),
          note: "Asked claimant for full week of bank statements",
          hash: ("0xev03" + "0".repeat(60)) as Hex,
        },
        {
          by: "claimant",
          at: new Date("2026-05-23T11:25:00Z"),
          note: "Bank statement week of 2026-05-17",
          hash: ("0xev04" + "0".repeat(60)) as Hex,
        },
      ],
      openedAt: new Date("2026-05-22T14:30:00Z"),
      updatedAt: new Date("2026-05-23T11:25:00Z"),
    });
}

export async function mockListDisputesForVendor(
  vendorId: string,
): Promise<DisputeCase[]> {
  return [..._disputes.values()]
    .filter((d) => d.vendorId === vendorId)
    .sort((a, b) => +b.openedAt - +a.openedAt);
}
export async function mockListDisputesAll(): Promise<DisputeCase[]> {
  return [..._disputes.values()].sort((a, b) => +b.openedAt - +a.openedAt);
}
export async function mockListDisputesByStatus(
  ...statuses: DisputeStatus[]
): Promise<DisputeCase[]> {
  return [..._disputes.values()]
    .filter((d) => statuses.includes(d.status))
    .sort((a, b) => +b.openedAt - +a.openedAt);
}
export async function mockGetDispute(caseId: Hex): Promise<DisputeCase | null> {
  return _disputes.get(caseId) ?? null;
}
/// the mobile cashout dispute
/// view used to fabricate `Case ID: d-${year}-0524-411` + `Opened 2 min
/// ago` static strings — invented data that lied to the vendor and
/// pointed the "Add evidence" CTA at the disputes LIST instead of the
/// real case page. This helper lets the page resolve the actual case
/// that openDisputeAction created for that cashout's contextRefId.
export async function mockGetDisputeByContext(
  context: DisputeContext,
  contextRefId: Hex,
): Promise<DisputeCase | null> {
  for (const d of _disputes.values()) {
    if (d.context === context && d.contextRefId === contextRefId) return d;
  }
  return null;
}
export async function mockOpenDispute(input: {
  caseId: Hex;
  context: DisputeContext;
  contextRefId: Hex;
  vendorId: string;
  claimantLabel: string;
  respondentLabel: string;
  amountUsdc: bigint;
  openingNote: string;
  openingHash: Hex;
}): Promise<DisputeCase> {
  const c: DisputeCase = {
    caseId: input.caseId,
    context: input.context,
    contextRefId: input.contextRefId,
    vendorId: input.vendorId,
    claimantLabel: input.claimantLabel,
    respondentLabel: input.respondentLabel,
    amountUsdc: input.amountUsdc,
    openingNote: input.openingNote,
    status: "OPENED",
    evidence: [
      {
        by: "claimant",
        at: new Date(),
        note: input.openingNote,
        hash: input.openingHash,
      },
    ],
    openedAt: new Date(),
    updatedAt: new Date(),
  };
  _disputes.set(input.caseId, c);
  return c;
}
export async function mockAddEvidence(
  caseId: Hex,
  item: DisputeEvidenceItem,
): Promise<DisputeCase | null> {
  const c = _disputes.get(caseId);
  if (!c) return null;
  c.evidence.push(item);
  c.status =
    item.by === "operator" ? "EVIDENCE_REQUESTED" : "EVIDENCE_SUBMITTED";
  c.updatedAt = new Date();
  return c;
}
export async function mockAssignDisputeToReview(
  caseId: Hex,
): Promise<DisputeCase | null> {
  const c = _disputes.get(caseId);
  if (!c) return null;
  c.status = "UNDER_REVIEW";
  c.updatedAt = new Date();
  return c;
}
export async function mockDecideDispute(
  caseId: Hex,
  outcome: DisputeOutcome,
  decisionNote: string,
  reasonHash: Hex,
): Promise<DisputeCase | null> {
  const c = _disputes.get(caseId);
  if (!c) return null;
  // refuse to overwrite a DECIDED case.
  // Previously operator misclick / attack could silently replace the
  // audit-of-record decision. On-chain DisputeManager reverts on replay; the
  // mock now mirrors that invariant so testnet behaviour matches mainnet.
  if (c.status === "DECIDED") {
    throw new Error(
      `dispute ${caseId} already DECIDED (outcome=${c.outcome}); cannot re-decide`,
    );
  }
  c.status = "DECIDED";
  c.outcome = outcome;
  c.decisionNote = decisionNote;
  c.decisionReasonHash = reasonHash;
  c.decidedAt = new Date();
  c.updatedAt = new Date();
  return c;
}

// ─── M9 retainer streams ─────────────────────────────────────────────────

export interface RetainerStreamRecord {
  streamId: Hex;
  vendorId: string; // recipient — the vendor who earns
  payerLabel: string;
  payerAddress: Hex;
  recipientAddress: Hex;
  depositUsdc: bigint;
  withdrawnUsdc: bigint;
  startAt: Date;
  endAt: Date;
  cancelledAt?: Date;
  cancelledVested?: bigint;
}

const _streams = new Map<Hex, RetainerStreamRecord>();

{
  // Seed one active stream so /vendor/retainer renders
  const sid = ("0x5712" + "0".repeat(60)) as Hex;
  const span = 30 * 24 * 3600 * 1000; // 30 days
  const elapsed = 8 * 24 * 3600 * 1000; // ~8 days in
  _streams.set(sid, {
    streamId: sid,
    vendorId: "vendor-asha",
    payerLabel: "Stellar Labs (client)",
    payerAddress: "0x111122223333444455556666777788889999aaaa" as Hex,
    recipientAddress: "0x7a3c1f9f9a8d1e2c4b9a8d6c4b3a2e1d0c9b8a7f" as Hex,
    depositUsdc: 9_000_000_000n, // $9,000 over 30 days = $300/day
    withdrawnUsdc: 1_200_000_000n, // already pulled $1,200
    startAt: new Date(Date.now() - elapsed),
    endAt: new Date(Date.now() - elapsed + span),
  });
}

function _vestedAt(s: RetainerStreamRecord, atMs: number): bigint {
  if (s.cancelledAt && s.cancelledVested !== undefined)
    return s.cancelledVested;
  const startMs = +s.startAt;
  const endMs = +s.endAt;
  if (atMs <= startMs) return 0n;
  const cap = atMs >= endMs ? endMs : atMs;
  const elapsed = BigInt(cap - startMs);
  const span = BigInt(endMs - startMs);
  return (s.depositUsdc * elapsed) / span;
}

export async function mockListStreams(
  vendorId: string,
): Promise<RetainerStreamRecord[]> {
  return [..._streams.values()]
    .filter((s) => s.vendorId === vendorId)
    .sort((a, b) => +b.startAt - +a.startAt);
}
export async function mockGetStream(
  id: Hex,
): Promise<RetainerStreamRecord | null> {
  return _streams.get(id) ?? null;
}
export async function mockCreateStream(input: {
  vendorId: string;
  payerLabel: string;
  payerAddress: Hex;
  recipientAddress: Hex;
  depositUsdc: bigint;
  startAt: Date;
  endAt: Date;
}): Promise<RetainerStreamRecord> {
  const sid = ("0x57" +
    Math.floor(Math.random() * 1e10)
      .toString(16)
      .padEnd(62, "0")
      .slice(0, 62)) as Hex;
  const r: RetainerStreamRecord = {
    streamId: sid,
    withdrawnUsdc: 0n,
    ...input,
  };
  _streams.set(sid, r);
  return r;
}
export async function mockWithdrawFromStream(
  id: Hex,
  amount: bigint,
): Promise<bigint> {
  const s = _streams.get(id);
  if (!s) throw new Error("unknown stream");
  const vested = _vestedAt(s, Date.now());
  const withdrawable = vested - s.withdrawnUsdc;
  if (amount > withdrawable)
    throw new Error(`amount ${amount} exceeds withdrawable ${withdrawable}`);
  s.withdrawnUsdc += amount;
  return amount;
}
export async function mockCancelStream(
  id: Hex,
): Promise<RetainerStreamRecord | null> {
  const s = _streams.get(id);
  if (!s) return null;
  if (s.cancelledAt) return s;
  s.cancelledVested = _vestedAt(s, Date.now());
  s.cancelledAt = new Date();
  return s;
}

export function vestedAmountFor(
  s: RetainerStreamRecord,
  atMs = Date.now(),
): bigint {
  return _vestedAt(s, atMs);
}
export function withdrawableAmountFor(
  s: RetainerStreamRecord,
  atMs = Date.now(),
): bigint {
  return _vestedAt(s, atMs) - s.withdrawnUsdc;
}

// Seed a bill for /vendor/bills/[id]
{
  const seed: Bill = {
    id: "bill_seed_01",
    vendorId: "vendor-asha",
    fromEmail: "ops@cloudvendor.io",
    fromName: "Cloud Vendor Inc.",
    amountUsdc: 480_000_000n, // $480
    description: "Q2 hosting + bandwidth",
    dueAt: new Date(Date.now() + 7 * 24 * 3600_000),
    status: "received",
    createdAt: new Date(Date.now() - 2 * 24 * 3600_000),
  };
  _bills.set(seed.id, seed);
}

export async function mockGetBill(id: string): Promise<Bill | null> {
  return _bills.get(id) ?? null;
}
export async function mockMarkBillPaid(id: string): Promise<Bill | null> {
  const b = _bills.get(id);
  if (!b) return null;
  b.status = "paid";
  return b;
}

// ─── M10 FX quotes + agents + agent jobs ─────────────────────────────────

export type FxStatus =
  | "simulated" // MockStableFXAdapter served the quote
  | "live testnet" // CircleStableFXAdapter wired (env set)
  | "access pending" // Circle TEST access not granted yet
  | "quote expired"
  | "settlement complete";

export interface FxQuote {
  id: string;
  /** Audit fix (loop iter 64): vendor ownership for the FX-quote settlement
   * auth check. Without this anyone could settle anyone's quote. */
  vendorId: string;
  srcToken: string;
  dstToken: string;
  srcAmountUsdc: bigint;
  dstAmount: bigint;
  rate: number;
  expiresAt: Date;
  quoteHash: Hex;
  status: FxStatus;
  createdAt: Date;
  settledAt?: Date;
}

const _fxQuotes = new Map<string, FxQuote>();

// Seed two demo quotes — one settled, one in-flight
{
  const a: FxQuote = {
    id: "fx_001",
    vendorId: "vendor-asha",
    srcToken: "USDC",
    dstToken: "EURC",
    srcAmountUsdc: 1_000_000_000n,
    dstAmount: 920_000_000n,
    rate: 0.92,
    expiresAt: new Date(Date.now() - 5 * 60_000),
    quoteHash: ("0xfa01" + "0".repeat(60)) as Hex,
    status: "settlement complete",
    createdAt: new Date(Date.now() - 10 * 60_000),
    settledAt: new Date(Date.now() - 9 * 60_000),
  };
  const b: FxQuote = {
    id: "fx_002",
    vendorId: "vendor-asha",
    srcToken: "USDC",
    dstToken: "EURC",
    srcAmountUsdc: 500_000_000n,
    dstAmount: 460_000_000n,
    rate: 0.92,
    expiresAt: new Date(Date.now() + 50_000),
    quoteHash: ("0xfa02" + "0".repeat(60)) as Hex,
    status: "simulated",
    createdAt: new Date(),
  };
  _fxQuotes.set(a.id, a);
  _fxQuotes.set(b.id, b);
}

export async function mockListFxQuotes(vendorId: string): Promise<FxQuote[]> {
  return [..._fxQuotes.values()]
    .filter((q) => q.vendorId === vendorId)
    .sort((a, b) => +b.createdAt - +a.createdAt);
}
export async function mockGetFxQuote(id: string): Promise<FxQuote | null> {
  return _fxQuotes.get(id) ?? null;
}
export async function mockCreateFxQuote(input: {
  vendorId: string;
  srcToken: string;
  dstToken: string;
  srcAmountUsdc: bigint;
  rate: number;
  status: FxStatus;
}): Promise<FxQuote> {
  const id = `fx_${Math.random().toString(36).slice(2, 10)}`;
  const dstAmount = BigInt(
    Math.floor(Number(input.srcAmountUsdc) * input.rate),
  );
  const q: FxQuote = {
    id,
    vendorId: input.vendorId,
    srcToken: input.srcToken,
    dstToken: input.dstToken,
    srcAmountUsdc: input.srcAmountUsdc,
    dstAmount,
    rate: input.rate,
    expiresAt: new Date(Date.now() + 60_000),
    quoteHash: ("0x" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")) as Hex,
    status: input.status,
    createdAt: new Date(),
  };
  _fxQuotes.set(id, q);
  return q;
}
export async function mockSettleFxQuote(
  id: string,
  vendorId: string,
): Promise<FxQuote | null> {
  const q = _fxQuotes.get(id);
  if (!q) return null;
  if (q.vendorId !== vendorId) return null;
  q.status = "settlement complete";
  q.settledAt = new Date();
  return q;
}

export type AgentJobStatus =
  | "CREATED"
  | "FUNDED"
  | "STARTED"
  | "DELIVERED"
  | "DISPUTED"
  | "CLOSED"
  | "CANCELLED";

export interface AgentListing {
  agentId: string; // bytes32 hex
  owner: Hex;
  displayName: string;
  category: "research" | "ops" | "creative" | "infra";
  description: string;
  pricingEndpointUrl: string;
  pricePerCallUsdc: bigint;
  feeBps: number;
  active: boolean;
}

const _agentListings = new Map<string, AgentListing>();
{
  const seed: AgentListing[] = [
    {
      agentId: "0xa9e1" + "0".repeat(60),
      owner: ("0x" + "a1".repeat(20)) as Hex,
      displayName: "ResearchOps GPT",
      category: "research",
      description:
        "Specialised market + competitor research with cited sources.",
      pricingEndpointUrl: "https://researchops.dev/pricing",
      pricePerCallUsdc: 2_000_000n, // $2/call
      feeBps: 500,
      active: true,
    },
    {
      agentId: "0xa9e2" + "0".repeat(60),
      owner: ("0x" + "a2".repeat(20)) as Hex,
      displayName: "Designer Agent",
      category: "creative",
      description: "Generates brand-kit-aligned Figma frames + tokens.",
      pricingEndpointUrl: "https://designer.agent/pricing",
      pricePerCallUsdc: 5_000_000n,
      feeBps: 750,
      active: true,
    },
    {
      agentId: "0xa9e3" + "0".repeat(60),
      owner: ("0x" + "a3".repeat(20)) as Hex,
      displayName: "Ops Daemon",
      category: "ops",
      description: "Watches your queues + escalates SLA breaches to PagerDuty.",
      pricingEndpointUrl: "https://opsdaemon.dev/pricing",
      pricePerCallUsdc: 500_000n,
      feeBps: 300,
      active: true,
    },
  ];
  for (const a of seed) _agentListings.set(a.agentId, a);
}

export async function mockListAgents(): Promise<AgentListing[]> {
  return [..._agentListings.values()]
    .filter((a) => a.active)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
export async function mockGetAgent(id: string): Promise<AgentListing | null> {
  return _agentListings.get(id) ?? null;
}

export interface AgentJob {
  jobId: string; // bytes32 hex
  vendorId: string; // who created the job (principal)
  agentId: string;
  agentLabel: string;
  amountUsdc: bigint;
  feeUsdc: bigint;
  description: string;
  deliverableHash?: Hex;
  status: AgentJobStatus;
  createdAt: Date;
  fundedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
}

const _agentJobs = new Map<string, AgentJob>();
{
  // Seed one in-flight job
  const j: AgentJob = {
    jobId: "0xa90b" + "0".repeat(60),
    vendorId: "vendor-asha",
    agentId: "0xa9e1" + "0".repeat(60),
    agentLabel: "ResearchOps GPT",
    amountUsdc: 200_000_000n, // $200
    feeUsdc: 10_000_000n, // 5%
    description:
      "Competitor pricing scan for our Q3 SaaS launch (top 5 incumbents).",
    status: "STARTED",
    createdAt: new Date(Date.now() - 2 * 3600_000),
    fundedAt: new Date(Date.now() - 90 * 60_000),
    startedAt: new Date(Date.now() - 60 * 60_000),
  };
  _agentJobs.set(j.jobId, j);
}

export async function mockGetAgentJob(jobId: string): Promise<AgentJob | null> {
  return _agentJobs.get(jobId) ?? null;
}
export async function mockListAgentJobs(vendorId: string): Promise<AgentJob[]> {
  return [..._agentJobs.values()]
    .filter((j) => j.vendorId === vendorId)
    .sort((a, b) => +b.createdAt - +a.createdAt);
}
export async function mockCreateAgentJob(input: {
  vendorId: string;
  agentId: string;
  agentLabel: string;
  amountUsdc: bigint;
  feeBps: number;
  description: string;
}): Promise<AgentJob> {
  const jobId =
    "0xa9" +
    Math.floor(Math.random() * 1e10)
      .toString(16)
      .padEnd(62, "0")
      .slice(0, 62);
  const feeUsdc = (input.amountUsdc * BigInt(input.feeBps)) / 10_000n;
  const j: AgentJob = {
    jobId,
    vendorId: input.vendorId,
    agentId: input.agentId,
    agentLabel: input.agentLabel,
    amountUsdc: input.amountUsdc,
    feeUsdc,
    description: input.description,
    status: "CREATED",
    createdAt: new Date(),
  };
  _agentJobs.set(jobId, j);
  return j;
}
export async function mockAdvanceAgentJob(
  jobId: string,
  to: AgentJobStatus,
  patch?: Partial<AgentJob>,
): Promise<AgentJob | null> {
  const j = _agentJobs.get(jobId);
  if (!j) return null;
  j.status = to;
  if (patch) Object.assign(j, patch);
  return j;
}

// ─── M11 reputation events + admin queues ────────────────────────────────

export type ReputationEventKind =
  | "INVOICE_SETTLED"
  | "INVOICE_SETTLED_LATE"
  | "CASHOUT_RELEASED"
  | "AGENT_JOB_CLOSED"
  | "DISPUTE_OPENED"
  | "DISPUTE_WON"
  | "DISPUTE_LOST"
  | "REFUND_ISSUED"
  | "SLASH_PENALTY"
  | "KYB_PASSED"
  | "KYB_REVOKED"
  | "MANUAL_ADJUST";

export interface ReputationEvent {
  id: number;
  vendorId: string;
  kind: ReputationEventKind;
  weight: number; // signed
  evidenceHash: Hex;
  reasonHash?: Hex;
  note: string;
  at: Date;
}

const _repEvents: ReputationEvent[] = [];
{
  const v = "vendor-asha";
  const seed: Omit<ReputationEvent, "id" | "vendorId">[] = [
    {
      kind: "KYB_PASSED",
      weight: 15,
      evidenceHash: ("0xeb01" + "0".repeat(60)) as Hex,
      note: "KYB review passed at signup",
      at: new Date("2026-05-01T09:00:00Z"),
    },
    {
      kind: "INVOICE_SETTLED",
      weight: 6,
      evidenceHash: ("0xeb02" + "0".repeat(60)) as Hex,
      note: "Invoice 0xc1...0000 settled in 1.4s",
      at: new Date("2026-05-03T11:25:00Z"),
    },
    {
      kind: "INVOICE_SETTLED",
      weight: 6,
      evidenceHash: ("0xeb03" + "0".repeat(60)) as Hex,
      note: "Invoice 0xc1...0001 settled in 1.6s",
      at: new Date("2026-05-08T15:40:00Z"),
    },
    {
      kind: "CASHOUT_RELEASED",
      weight: 8,
      evidenceHash: ("0xeb04" + "0".repeat(60)) as Hex,
      note: "$200 USDC→INR cashout released without dispute",
      at: new Date("2026-05-12T10:10:00Z"),
    },
    {
      kind: "INVOICE_SETTLED_LATE",
      weight: 3,
      evidenceHash: ("0xeb05" + "0".repeat(60)) as Hex,
      note: "Invoice 0xc1...0002 settled 3d after due",
      at: new Date("2026-05-15T13:00:00Z"),
    },
    {
      kind: "AGENT_JOB_CLOSED",
      weight: 5,
      evidenceHash: ("0xeb06" + "0".repeat(60)) as Hex,
      note: "Closed ResearchOps job 0xa9...0b",
      at: new Date("2026-05-18T16:30:00Z"),
    },
    {
      kind: "DISPUTE_OPENED",
      weight: -2,
      evidenceHash: ("0xeb07" + "0".repeat(60)) as Hex,
      note: "Opened cashout dispute 0xd1...0000",
      at: new Date("2026-05-22T14:30:00Z"),
    },
  ];
  seed.forEach((e, i) => _repEvents.push({ id: i + 1, vendorId: v, ...e }));
}

export async function mockListReputationEvents(
  vendorId: string,
): Promise<ReputationEvent[]> {
  return _repEvents
    .filter((e) => e.vendorId === vendorId)
    .sort((a, b) => +b.at - +a.at);
}

export interface ReputationScore {
  raw: number;
  score: number; // 0-1000
  tier: "EMERGING" | "ACTIVE" | "ESTABLISHED" | "PRIORITY";
  formulaVersion: number;
  /** 7-field breakdown per v2 §17.2 — shown on /vendor/reputation. */
  fields: {
    paymentConsistency: number;
    cashoutHistory: number;
    disputeRate: number;
    agentJobs: number;
    kybStatus: number;
    tenure: number;
    velocity: number;
  };
}

export async function mockComputeReputation(
  vendorId: string,
  vendorCreatedAt: Date,
): Promise<ReputationScore> {
  const events = await mockListReputationEvents(vendorId);
  const raw = events.reduce((acc, e) => acc + e.weight, 0);
  let s = raw * 10;
  if (s < 0) s = 0;
  if (s > 1000) s = 1000;

  const settled = events.filter((e) => e.kind === "INVOICE_SETTLED").length;
  const settledLate = events.filter(
    (e) => e.kind === "INVOICE_SETTLED_LATE",
  ).length;
  const cashouts = events.filter((e) => e.kind === "CASHOUT_RELEASED").length;
  const disputes = events.filter(
    (e) => e.kind === "DISPUTE_OPENED" || e.kind === "DISPUTE_LOST",
  ).length;
  const jobs = events.filter((e) => e.kind === "AGENT_JOB_CLOSED").length;
  const kyb = events.find((e) => e.kind === "KYB_PASSED") ? 100 : 0;
  const tenureDays = (Date.now() - +vendorCreatedAt) / 86_400_000;

  return {
    raw,
    score: s,
    tier:
      s >= 850
        ? "PRIORITY"
        : s >= 650
          ? "ESTABLISHED"
          : s >= 400
            ? "ACTIVE"
            : "EMERGING",
    formulaVersion: 1,
    fields: {
      paymentConsistency: Math.min(
        100,
        Math.round(
          ((settled + settledLate / 2) / Math.max(1, settled + settledLate)) *
            100,
        ),
      ),
      cashoutHistory: Math.min(100, cashouts * 25),
      disputeRate: Math.max(0, 100 - disputes * 20),
      agentJobs: Math.min(100, jobs * 30),
      kybStatus: kyb,
      tenure: Math.min(100, Math.round(tenureDays / 3.65)),
      velocity: Math.min(100, events.length * 12),
    },
  };
}

// Admin queue items — synthesises real cases from the existing in-memory stores.
export type AdminQueueKind =
  | "disputes"
  | "cashout-pending"
  | "refund-review"
  | "lp-kyb"
  | "agent-flagged"
  | "screening-fail"
  | "sub-stake-lp"
  | "frozen"
  | "locked-out"
  | "dispute-overdue"
  | "pause-active";

export interface AdminQueueItem {
  kind: AdminQueueKind;
  id: string;
  label: string;
  subject: string;
  amountUsdc?: bigint;
  openedAt: Date;
  ageHours: number;
  severity: "low" | "med" | "high" | "critical";
  href: string;
}

export async function mockAdminQueueCounts(): Promise<
  Record<AdminQueueKind, number>
> {
  const disputes = (await mockListDisputesAll()).filter(
    (d) => d.status !== "DECIDED",
  ).length;
  const cashouts = (await mockListClaimableCashouts()).length;
  return {
    disputes: disputes,
    "cashout-pending": cashouts,
    "refund-review": 1,
    "lp-kyb": 1,
    "agent-flagged": 0,
    "screening-fail": 0,
    "sub-stake-lp": 0,
    frozen: 0,
    "locked-out": 0,
    "dispute-overdue": disputes > 0 ? 1 : 0,
    "pause-active": 0,
  };
}

export async function mockAdminQueueItems(
  kind: AdminQueueKind,
): Promise<AdminQueueItem[]> {
  const now = Date.now();
  if (kind === "disputes") {
    const ds = (await mockListDisputesAll()).filter(
      (d) => d.status !== "DECIDED",
    );
    return ds.map((d) => ({
      kind: "disputes",
      id: d.caseId,
      label: `${d.claimantLabel} vs ${d.respondentLabel}`,
      subject: d.claimantLabel,
      amountUsdc: d.amountUsdc,
      openedAt: d.openedAt,
      ageHours: Math.round((now - +d.openedAt) / 3_600_000),
      severity: d.amountUsdc > 1_000_000_000n ? "high" : "med",
      href: `/admin/disputes`,
    }));
  }
  if (kind === "cashout-pending") {
    const cs = await mockListClaimableCashouts();
    return cs.map((c) => ({
      kind: "cashout-pending",
      id: c.id,
      label: `${c.currency} cashout · ${(Number(c.usdcAmount) / 1_000_000).toFixed(2)} USDC`,
      subject: c.vendorWallet,
      amountUsdc: c.usdcAmount,
      openedAt: c.requestedAt,
      ageHours: Math.round((now - +c.requestedAt) / 3_600_000),
      severity: "low",
      href: `/admin`,
    }));
  }
  if (kind === "lp-kyb") {
    const lps = (await mockListLPs()).filter(
      (l) => l.status === "UNDER_REVIEW" || l.status === "DOCS_UPLOADED",
    );
    return lps.map((l) => ({
      kind: "lp-kyb",
      id: l.lpId,
      label: `${l.legalEntityName ?? l.contactEmail} · ${l.country ?? ""}`,
      subject: l.contactEmail,
      openedAt: l.updatedAt,
      ageHours: Math.round((now - +l.updatedAt) / 3_600_000),
      severity: "med",
      href: `/admin`,
    }));
  }
  return [];
}

// ─── M9 vendor profile / branding helpers ────────────────────────────────

export async function mockGetVendor(id: string): Promise<Vendor | null> {
  return _vendors.get(id) ?? null;
}

export async function mockUpdateVendorBranding(
  id: string,
  patch: {
    displayName?: string;
    brandColor?: string;
    brandLogoUrl?: string;
  },
): Promise<Vendor | null> {
  const v = _vendors.get(id);
  if (!v) return null;
  if (patch.displayName) v.displayName = patch.displayName;
  if (patch.brandColor) v.brandColor = patch.brandColor;
  if (patch.brandLogoUrl !== undefined) v.brandLogoUrl = patch.brandLogoUrl;
  v.invoiceTemplateVersion = (v.invoiceTemplateVersion ?? 1) + 1;
  return v;
}
