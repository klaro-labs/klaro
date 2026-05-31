# D5 Frontend Audit — Klaro Web App

**Auditor:** d5_frontend  
**Date:** 2026-05-31  
**Scope:** apps/web/app/**, apps/web/components/**, apps/web/lib/repo/**  
**Lens:** RSC/client boundary, server actions, data-fetching, error boundaries, form validation, honest-mode correctness

## Summary

The frontend is well-structured with consistent patterns: `requireVendor()` auth gates, zod validation on API routes, ownership checks on mutations, and honest-mode labelling. The recently rewired pages (disputes, agents, team, webhooks) correctly use the new repo layer with proper auth + tenant isolation. However, several medium-severity issues remain:

1. **Dispute ownership verification uses mock functions in live mode** — the `openDisputeAction` server action and `/api/v1/disputes` route both call `mockGetAgentJob()` / `mockGetStream()` for ownership checks, which return in-memory mock data even when Supabase is live. This means agent/stream dispute ownership is unverifiable in production.
2. **Missing `revalidatePath` in several mutating actions** — `createInvoiceAction`, `createLinkAction`, `deactivateLinkAction`, and `recordInvoicePublishedAction` don't revalidate, so the UI shows stale data after mutations.
3. **Data-fetching waterfalls** in several pages where independent queries are sequential instead of parallel.
4. **Missing loading/error boundaries** for key routes that perform async data fetching.
5. **Inline server actions in loops** capture closure variables that serialize across the wire boundary.

---

### [P1] Dispute ownership check uses mock-only functions in live mode

- file: apps/web/app/(wallet)/vendor/disputes/actions.ts:74-77
- lens: frontend / data integrity
- what: `openDisputeAction` calls `mockGetAgentJob(contextRefId)` and `mockGetStream(contextRefId)` for ownership verification when `context === "agent"` or `context === "stream"`. These functions read from in-memory mock state, not from Supabase.
- why: When Supabase is live (`supabaseLive() === true`), the mock store is empty (no seeded data). The ownership check `aj?.vendorId` will always be `null` → the action throws "contextRefId not found" for every legitimate agent/stream dispute. The feature silently fails in live mode. The same issue exists in `apps/web/app/api/v1/disputes/route.ts:56-61`.
- fix: Replace `mockGetAgentJob` with `agentJobsRepo.getJob(contextRefId)` (which already exists and is dual-mode). For streams, either create a `streams` repo or gate the stream dispute path behind `!supabaseLive()` with an honest error.
- confidence: high

---

### [P2] createInvoiceAction missing revalidatePath

- file: apps/web/app/(wallet)/vendor/invoices/new/actions.ts:104
- lens: frontend / stale UI
- what: `createInvoiceAction` returns the invoice ID but never calls `revalidatePath("/vendor/invoices")`. The InvoiceForm client component uses `router.push` after receiving the ID, but the invoices list page will show stale cached data until the user hard-refreshes.
- why: Next.js 15 caches RSC payloads aggressively. Without `revalidatePath`, the vendor's invoice list won't include the newly created invoice on navigation back.
- fix: Add `revalidatePath("/vendor/invoices")` before the return statement.
- confidence: high

---

### [P2] deactivateLinkAction missing revalidatePath

- file: apps/web/app/(wallet)/vendor/links/[id]/actions.ts:17
- lens: frontend / stale UI
- what: `deactivateLinkAction` soft-deletes a link but never calls `revalidatePath`. The links list page and the link detail page will continue showing the deactivated link as active.
- why: Same RSC caching issue. The mutation succeeds server-side but the client sees stale data.
- fix: Add `revalidatePath("/vendor/links")` and `revalidatePath(\`/vendor/links/${id}\`)` after `deactivateLink(id)`.
- confidence: high

---

### [P2] createLinkAction missing revalidatePath

- file: apps/web/app/(wallet)/vendor/links/new/actions.ts:138
- lens: frontend / stale UI
- what: `createLinkAction` creates a link and returns its ID but never calls `revalidatePath("/vendor/links")`. The links list page will show stale data.
- why: Same pattern as the invoice action. The client component likely does a `router.push` but the destination page serves cached RSC.
- fix: Add `revalidatePath("/vendor/links")` before the return.
- confidence: high

---

### [P2] recordInvoicePublishedAction missing revalidatePath

- file: apps/web/app/(wallet)/vendor/invoices/new/actions.ts:136-140
- lens: frontend / stale UI
- what: `recordInvoicePublishedAction` persists the tx hash but never revalidates the invoice detail page or the invoices list. The "Published" badge won't appear until a hard refresh.
- why: The invoice detail page at `/vendor/invoices/[id]` is a server component that reads the invoice once. Without revalidation, the published state is invisible.
- fix: Add `revalidatePath(\`/vendor/invoices/${invoiceId}\`)`.
- confidence: high

---

### [P2] Vendor cashout page sequential data-fetching waterfall

- file: apps/web/app/(wallet)/vendor/cashout/page.tsx:72-73
- lens: frontend / performance
- what: `listInvoicesForVendor(vendor.id)` and `listCashoutsForVendor(vendor.id)` are awaited sequentially. These are independent queries that could run in parallel.
- why: Each query hits Supabase independently. Sequential execution doubles the page's TTFB under live DB conditions. The vendor layout already demonstrates the correct pattern with `Promise.all`.
- fix: Wrap in `Promise.all([listInvoicesForVendor(vendor.id), listCashoutsForVendor(vendor.id)])`.
- confidence: high

---

### [P2] Vendor financing page sequential data-fetching waterfall

- file: apps/web/app/(wallet)/vendor/financing/page.tsx:23-24
- lens: frontend / performance
- what: Same pattern — `listInvoicesForVendor` and `listCashoutsForVendor` awaited sequentially.
- why: Same as above. Independent queries should be parallelized.
- fix: `const [invoices, cashouts] = await Promise.all([...])`.
- confidence: high

---

### [P2] Vendor agents page sequential data-fetching waterfall

- file: apps/web/app/(wallet)/vendor/agents/page.tsx:84-85
- lens: frontend / performance
- what: `listAgentJobs(session.vendor.id)` and `mockListAgents()` are awaited sequentially.
- why: These are independent data sources. Parallelizing saves one round-trip.
- fix: `const [jobs, agents] = await Promise.all([listAgentJobs(session.vendor.id), mockListAgents()])`.
- confidence: high

---

### [P3] Inline server action in loop captures closure variables

- file: apps/web/app/(wallet)/vendor/agents/page.tsx:211-237
- lens: frontend / correctness
- what: The inline `"use server"` action inside the `.map()` loop captures `j.jobId`, `next.to`, and `j` from the closure. These values are serialized into the action's encrypted closure by Next.js. While this works, it means every rendered job embeds its full state in the HTML payload, increasing page size proportionally to job count.
- why: Next.js serializes all captured variables into the server action reference. For a list of N jobs, this creates N distinct action endpoints with N copies of job data in the RSC payload. With many jobs, this bloats the page significantly.
- fix: Extract the inline action into a separate client component (`AdvanceJobButton`) that calls `advanceJobAction` with explicit parameters, or use a hidden form with `<input type="hidden" name="jobId" value={j.jobId} />`.
- confidence: medium

---

### [P3] Missing loading.tsx for vendor/agents, vendor/team, vendor/links, vendor/integrations/webhooks

- file: apps/web/app/(wallet)/vendor/agents/ (no loading.tsx)
- lens: frontend / UX
- what: The recently rewired pages (`/vendor/agents`, `/vendor/team`, `/vendor/links`, `/vendor/integrations/webhooks`) lack `loading.tsx` boundaries. Only `/vendor` (root), `/vendor/cashout/[id]`, `/vendor/disputes/[caseId]`, and `/vendor/invoices/[id]` have them.
- why: Without a loading boundary, navigation to these pages shows no visual feedback while the server component fetches data. Under slow DB conditions, the user sees a frozen UI. The parent `/vendor/loading.tsx` only covers the initial vendor layout load, not nested page transitions.
- fix: Add `loading.tsx` skeletons for each of these routes.
- confidence: high

---

### [P3] Vendor dashboard page duplicates layout data fetch

- file: apps/web/app/(wallet)/vendor/page.tsx:42
- lens: frontend / performance
- what: The vendor dashboard calls `listInvoicesForVendor(vendor.id)` to compute balances and show recent invoices. The parent layout (`vendor/layout.tsx:28`) already fetches the same data for badge counts. This results in the same query being executed twice per page load.
- why: Next.js does not deduplicate `fetch` calls across layout and page boundaries when using Supabase client (not native `fetch`). The vendor sees doubled DB load on every dashboard visit.
- fix: Either pass the invoice data down via a React context/prop from the layout, or accept the duplication as a tradeoff for component isolation (document the decision). Alternatively, use Next.js `unstable_cache` or React `cache()` to deduplicate.
- confidence: medium

---

### [P3] Team page inline server actions in loop capture closure

- file: apps/web/app/(wallet)/vendor/team/page.tsx:117-130
- lens: frontend / correctness
- what: The `changeRoleAction` and `removeTeammateAction` are called from inline `"use server"` closures inside a `.map()` loop, capturing `m.id` from the outer scope. Same serialization concern as the agents page.
- why: Each team member row embeds a distinct server action reference with the member ID baked in. For small teams this is fine; for larger teams it inflates the RSC payload.
- fix: Extract into a client component (`TeamMemberActions`) that receives `memberId` as a prop and calls the actions explicitly.
- confidence: low (functional, just suboptimal)

---

### [P3] Dispute detail page inline server action captures full case object

- file: apps/web/app/(wallet)/vendor/disputes/[caseId]/page.tsx:148-153
- lens: frontend / correctness
- what: The inline `"use server"` action in the evidence form captures `c.caseId` from the outer scope (the full dispute case object `c` is in scope). Next.js will serialize `c.caseId` (a string) which is fine, but the closure also has access to the full `c` object.
- why: Next.js only serializes variables actually referenced in the closure body. Since only `c.caseId` is used, this is technically safe. However, if someone later adds `c.vendorId` or other fields to the closure, the full case data would be serialized into the client HTML.
- fix: Assign `const caseId = c.caseId` before the JSX and reference only `caseId` in the closure to make the boundary explicit.
- confidence: low

---

### [P3] signInWithGoogleUrl in lib/auth.ts uses createBrowserClient server-side

- file: apps/web/lib/auth.ts:196-202
- lens: frontend / correctness
- what: `signInWithGoogleUrl` uses `createBrowserClient` from `@supabase/ssr`. This function is designed for browser contexts. It's called from the `"use client"` signin page, so it executes in the browser — but the function lives in `lib/auth.ts` alongside server-only functions (`getCurrentSession`, `requireVendor`). There's no tree-shaking boundary.
- why: If `lib/auth.ts` is ever imported by a server component that also uses `signInWithGoogleUrl`, the `createBrowserClient` import would execute server-side where it may behave unexpectedly. Currently safe because the signin page is `"use client"` and Next.js bundles it separately, but the architecture is fragile.
- fix: Move `signInWithGoogleUrl` and `sendEmailMagicLink` to a separate `lib/auth.client.ts` file to make the boundary explicit.
- confidence: medium

---

### [P3] Cashout page fetches invoices redundantly with layout

- file: apps/web/app/(wallet)/vendor/cashout/page.tsx:72
- lens: frontend / performance
- what: The cashout page fetches `listInvoicesForVendor(vendor.id)` to compute balances. The parent layout already fetches the same data for the pending invoice badge count. This is a duplicated query.
- why: Same as the dashboard finding. Supabase client calls aren't deduplicated by Next.js's built-in fetch cache.
- fix: Accept as architectural tradeoff or use React `cache()` wrapper around `listInvoicesForVendor`.
- confidence: medium

---

### [P4] Webhook signing secret exposed in UI

- file: apps/web/app/(wallet)/vendor/integrations/webhooks/page.tsx:82-85
- lens: frontend / security
- what: The webhooks page renders `w.signingSecret` directly in the UI. The repo layer (`lib/repo/webhooks.ts:18`) sets this to `HIDDEN = "whsec_•••• (shown once at creation)"` for list queries, which is correct. However, at creation time (`createWebhook` returns the real secret), the page would show the real secret on the first render after creation (before the next list fetch replaces it with the masked value).
- why: The `createWebhookAction` calls `revalidatePath` which triggers a re-render. The re-render calls `listWebhooks` which returns the masked value. So the real secret is only visible in the `createWebhook` return value, which is not directly rendered. This is actually safe — the secret is shown once at creation via the repo return, but the page re-renders with the masked list. No actual exposure.
- fix: No fix needed — the current flow is correct. The secret is shown once at creation time (which is the intended UX) and masked on subsequent loads.
- confidence: low (false positive on closer inspection)

---

### [P3] Missing error boundary for vendor/links route

- file: apps/web/app/(wallet)/vendor/links/ (no error.tsx)
- lens: frontend / resilience
- what: The `/vendor/links` route and its children (`/vendor/links/new`, `/vendor/links/[id]`) have no `error.tsx` boundary. If `listLinksForVendor` throws (e.g., Supabase timeout), the error bubbles up to the parent `/vendor/error.tsx` which shows a generic "Something went wrong" without context about what failed.
- why: A route-specific error boundary can show a more helpful message ("Failed to load payment links — try again") and offer a retry button specific to the links context.
- fix: Add `apps/web/app/(wallet)/vendor/links/error.tsx` with a links-specific error message.
- confidence: medium

---

### [P3] Vendor agents page shows mock-only UI in live mode with honest label but wrong gate

- file: apps/web/app/(wallet)/vendor/agents/page.tsx:53-80
- lens: frontend / honest-mode
- what: The agents page gates on `supabaseLive()` to show the "partner-pending" panel. But `supabaseLive()` only checks if Supabase is configured — it doesn't check if the agent jobs table is actually wired. The comment says "agent-jobs persistence + AgentEscrow wiring is M11 work" but the repo layer (`lib/repo/agentJobs.ts`) already has full Supabase support via `tryDb()`. So in live mode, the page shows "Agent marketplace lands in M11" even though the repo can read/write agent jobs to Supabase.
- why: The gate is overly conservative. The repo layer is dual-mode and works in live mode. The honest label is technically wrong — the feature IS persistent in live mode (via the repo), just not wired to the on-chain AgentEscrow contract. The label should say "on-chain escrow pending" not "lands in M11".
- fix: Remove the `supabaseLive()` gate or change it to check `isLiveOnChain()` (which checks if the contract address is configured). Show the full UI with an honest badge "Escrow not yet on-chain · DB-persisted".
- confidence: high

---

### [P4] Audit log action codes are incorrect (copy-paste)

- file: apps/web/app/(wallet)/vendor/retainer/actions.ts:60,82,100
- lens: frontend / observability
- what: All three retainer actions (`createStreamAction`, `withdrawStreamAction`, `cancelStreamAction`) use `action: "lp.admit"` in their `auditRecord` calls. This is clearly a copy-paste error — "lp.admit" is the LP admission action, not a retainer operation.
- why: The audit log becomes unreliable for retainer operations. An operator searching for "all LP admissions" gets polluted with retainer stream events. Same issue exists in `lp/actions.ts` where `claimOrderAction` also uses `action: "lp.admit"`.
- fix: Use `action: "retainer.create"`, `action: "retainer.withdraw"`, `action: "retainer.cancel"` respectively.
- confidence: high

---

### [P4] LP actions use wrong audit action code

- file: apps/web/app/lp/actions.ts:60,82,100,130,165
- lens: frontend / observability
- what: Multiple LP actions (`submitApplicationAction`, `submitDocsAction`, `approveApplicationAction`, `claimOrderAction`, `stakeAction`) all use `action: "lp.admit"` regardless of what they actually do.
- why: Same copy-paste issue. The audit log can't distinguish between an LP application submission, a document upload, an approval, an order claim, and a stake operation.
- fix: Use distinct action codes: `"lp.apply"`, `"lp.docs"`, `"lp.approve"`, `"lp.claim"`, `"lp.stake"`.
- confidence: high
