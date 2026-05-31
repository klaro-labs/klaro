# D7b — Injection / SSRF / Secrets Audit

**Auditor:** d7b_ssrf_secrets_injection  
**Date:** 2026-05-31  
**Scope:** `apps/web` + `apps/daemon` — SSRF, secrets, injection, XSS, RLS correctness, rate-limiting gaps

## Summary

The codebase shows strong SSRF defenses (DNS-rebinding-aware validation + redirect refusal on both web and daemon), correct HMAC signing with `crypto.timingSafeEqual`, and solid open-redirect mitigation via a shared `safeRedirect` helper. The main findings are:

1. **CSP mismatch** between middleware (overly permissive `connect-src 'self' https: wss:`) and next.config.mjs (strict allowlist) — middleware-minted responses (429, 302) get the weak CSP.
2. **CRON_SECRET compared with `!==`** (non-timing-safe) — low severity since it's a bearer token over HTTPS, but inconsistent with the project's own `timingSafeEqual` pattern.
3. **Missing RLS UPDATE policy on `disputes`** — `addEvidence()` and `assignToReview()` call `.update()` via the RLS client and will fail live.
4. **Missing RLS INSERT/UPDATE/DELETE policies on `vendor_team_members`** — `inviteTeammate()`, `changeRole()`, `removeTeammate()` use the RLS client and will fail live.
5. **`webhook_deliveries` has SELECT-only RLS** — `recordDelivery()` in `apps/web/lib/repo/webhooks.ts` uses the RLS client to INSERT and will fail live.
6. **TOCTOU window in SSRF guard** — DNS is resolved, then `fetch()` resolves DNS again independently. A fast-flipping A-record could pass the check but resolve differently at fetch time. Mitigated by the redirect refusal but not fully closed.
7. **`unsafe-eval` in CSP** — allows `eval()` in all pages, not just those that need it.

---

## Findings

### [MED] CSP connect-src wildcard in middleware-minted responses

- file: apps/web/middleware.ts:17
- lens: injection (XSS data exfil)
- what: Middleware's CSP uses `connect-src 'self' https: wss:` — allows fetch/XHR/WebSocket to ANY https origin. next.config.mjs (line 25) has a strict allowlist (`*.supabase.co`, `*.circle.com`, etc.).
- why: Middleware-minted responses (rate-limit 429, admin redirect 302, and all rewritten subdomain responses) get the permissive CSP. If an XSS lands on any page served through a middleware rewrite, the attacker can exfiltrate data to any HTTPS endpoint. The next.config CSP only applies to responses Next.js generates directly.
- fix: Copy the strict `connect-src` allowlist from next.config.mjs into the middleware's `CSP_DEFAULT` constant. Keep them in sync via a shared constant or a test.
- confidence: HIGH

---

### [MED] Missing RLS UPDATE policy on `disputes` table — vendor writes will fail live

- file: apps/web/supabase/migrations/0021_vendor_write_policies.sql:30 (INSERT only)
- lens: injection/RLS
- what: Migration 0021 adds `disputes vendor insert` but no UPDATE policy. The repo functions `addEvidence()` (disputes.ts:175) and `assignToReview()` (disputes.ts:186) call `.update({ status })` on the `disputes` table via the RLS-scoped client (`tryDb()`). The only existing policies are SELECT (0004:232) and INSERT (0021:30).
- why: Any vendor-session `.update()` on `disputes` will be silently rejected by RLS (returns 0 rows updated, no error from PostgREST). Evidence submission and review assignment will appear to succeed but have no effect. This is a functional failure, not a security hole — but it means the dispute flow is broken in live mode.
- fix: Add an UPDATE policy: `create policy "disputes vendor update" on disputes for update using (claimant_kind = 'vendor' and claimant_id::uuid = current_vendor_id()) with check (claimant_kind = 'vendor' and claimant_id::uuid = current_vendor_id());`
- confidence: HIGH

---

### [MED] Missing RLS INSERT/UPDATE/DELETE policies on `vendor_team_members`

- file: apps/web/supabase/migrations/0002_vendors_and_customers.sql:116
- lens: injection/RLS
- what: The only policy on `vendor_team_members` is SELECT (`team reads own vendor`, line 116). The repo layer (`lib/repo/team.ts`) calls `.insert()` (line 86), `.update()` (line 96, 106) via the RLS-scoped client. No INSERT/UPDATE/DELETE policies exist in any migration.
- why: `inviteTeammate()`, `changeRole()`, and `removeTeammate()` will all fail silently in live Supabase mode. Team management is completely broken when RLS is enforced.
- fix: Add write policies scoped to the vendor owner: `create policy "team vendor insert" on vendor_team_members for insert with check (vendor_id = current_vendor_id()); create policy "team vendor update" on vendor_team_members for update using (vendor_id = current_vendor_id()); create policy "team vendor delete" on vendor_team_members for delete using (vendor_id = current_vendor_id());`
- confidence: HIGH

---

### [MED] `webhook_deliveries` SELECT-only RLS — web recordDelivery INSERT will fail

- file: apps/web/supabase/migrations/0005_erp_webhooks_audit_agents.sql:157
- lens: injection/RLS
- what: The `webhook_deliveries` table has only a SELECT policy (`deliveries vendor scope`). The web repo function `recordDelivery()` (lib/repo/webhooks.ts:93) calls `.insert()` via the RLS-scoped client. The daemon uses `serviceDb()` (bypasses RLS) so it works, but the web's test-ping audit row write will fail.
- why: The `recordDelivery` function's `try/catch` swallows the error (line 97: `/* best-effort */`), so the failure is silent. Test-ping deliveries won't be audited in the `webhook_deliveries` table when running through the RLS path.
- fix: Either (a) switch `recordDelivery` to use `serviceDb()` since it's already called from an authenticated server action, or (b) add an INSERT policy: `create policy "deliveries vendor insert" on webhook_deliveries for insert with check (exists (select 1 from webhooks w where w.id = webhook_id and w.vendor_id = current_vendor_id()));`
- confidence: HIGH

---

### [LOW] CRON_SECRET compared with non-timing-safe `!==`

- file: apps/web/app/api/cron/lifecycle-reminders/route.ts:44
- lens: secrets
- what: `if (auth !== \`Bearer ${CRON_SECRET}\`)` uses JavaScript's `!==` operator for secret comparison.
- why: Non-constant-time comparison leaks information about the secret's prefix via timing side-channel. Practical exploitability is low (requires sub-microsecond timing precision over HTTPS, and the secret is a bearer token not an HMAC), but it's inconsistent with the project's own `timingSafeEqual` helper in `lib/secrets.ts` and `crypto.timingSafeEqual` usage in `webhookVerify.ts`.
- fix: Use `crypto.timingSafeEqual(Buffer.from(auth ?? ""), Buffer.from(\`Bearer ${CRON_SECRET}\`))` with a length pre-check.
- confidence: MEDIUM (real but low practical risk)

---

### [LOW] CSP allows `'unsafe-eval'` globally

- file: apps/web/next.config.mjs:20, apps/web/middleware.ts:18
- lens: injection (XSS)
- what: `script-src 'self' 'unsafe-inline' 'unsafe-eval'` is applied to every route.
- why: `unsafe-eval` permits `eval()`, `Function()`, and `setTimeout("string")` — if an attacker achieves HTML injection (even without script injection), they can escalate via eval-based gadgets. The comment says "next/script requires 'unsafe-inline' for hydration" but `unsafe-eval` is not required by Next.js App Router in production builds (it's needed only for dev HMR).
- fix: Remove `'unsafe-eval'` from production CSP. If a specific dependency requires it (e.g., a WASM loader), scope it to that route only via a per-route header override.
- confidence: HIGH (the directive is present; exploitability depends on finding an injection vector)

---

### [LOW] SSRF TOCTOU — DNS resolved separately by guard and fetch

- file: apps/web/lib/safeFetchUrl.ts:76, apps/web/lib/webhooks.ts:81
- lens: ssrf
- what: `assertPublicHttpUrl()` resolves DNS via `node:dns/promises` lookup, then `fetch()` resolves DNS again via the system resolver. Between the two calls (microseconds to milliseconds), a DNS record with a very low TTL could flip from a public IP to a private IP.
- why: The redirect refusal (`redirect: "manual"`) closes the most common exploitation path (302 to IMDS). But a direct A-record flip between the guard's lookup and fetch's lookup could still reach a private IP. This is a known limitation of userspace SSRF guards without kernel-level enforcement (e.g., eBPF or a proxy).
- fix: Pin the resolved IP and pass it to fetch via a custom `dispatcher` (undici) or use a forward proxy that enforces the same private-range blocklist at the network layer. Alternatively, accept the residual risk given the redirect refusal + the short TOCTOU window.
- confidence: MEDIUM (theoretically exploitable but requires attacker-controlled DNS with sub-ms TTL)

---

### [LOW] Custom `timingSafeEqual` in secrets.ts is weaker than `crypto.timingSafeEqual`

- file: apps/web/lib/secrets.ts:26-29
- lens: secrets
- what: The custom `timingSafeEqual` implementation uses a character-by-character XOR loop. It short-circuits on length mismatch (`if (a.length !== b.length) return false`) which leaks length information.
- why: The function is currently unused in production code (only imported in tests). However, its existence alongside the correct `crypto.timingSafeEqual` usage in `webhookVerify.ts` creates a maintenance hazard — a future developer might import the weaker version by mistake.
- fix: Either (a) remove the custom implementation and always use `crypto.timingSafeEqual` with a length pre-check, or (b) add a deprecation comment + lint rule preventing its import outside tests.
- confidence: LOW (not used in production today)

---

### [INFO] `dangerouslySetInnerHTML` usage is safe

- file: apps/web/components/klaro/JsonLd.tsx:9
- lens: injection (XSS)
- what: `dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}` inside a `<script type="application/ld+json">` tag.
- why: `JSON.stringify` produces valid JSON (no unescaped HTML), and the `</` replacement prevents script-tag breakout. This is the standard safe pattern for JSON-LD. No finding.
- fix: None needed.
- confidence: N/A

---

### [INFO] Rate limiting is in-memory per edge node — not shared

- file: apps/web/middleware.ts:96-112
- lens: injection/rate-limiting
- what: The rate limiter uses an in-memory `Map` per edge node. Vercel deploys multiple edge instances; each has its own bucket.
- why: An attacker can distribute requests across edge nodes to exceed the 60 req/min limit by a factor of N (number of active edge instances). The code acknowledges this limitation in comments. For the cron endpoint, the `CRON_SECRET` bearer token is the real gate. For `/api/auth/magic`, Supabase's own per-project rate limit is the backstop.
- fix: Move to a shared rate-limit store (Upstash Redis rate-limit, already available via `REDIS_URL`) for sensitive endpoints like `/api/auth/magic` and `/api/v1/webauthn/*`.
- confidence: HIGH (the gap exists; practical impact depends on attack scenario)

---

### [INFO] Open redirect defenses are solid

- file: apps/web/lib/safeRedirect.ts (entire file)
- lens: injection
- what: Consolidated `isSafeOriginRelative()` rejects backslash-prefix, protocol-relative, and off-origin URLs. All three redirect sites (auth callback, magic link, moonpay) route through this helper.
- why: No finding — the fix is comprehensive and covers the known bypass vectors.
- fix: None needed.
- confidence: N/A

---

### [INFO] HMAC signing and verification are correct

- file: apps/web/lib/webhookVerify.ts:54-66, apps/web/lib/webhooks.ts:56-60
- lens: secrets
- what: Signing uses `crypto.createHmac("sha256", secret).update(\`${t}.${body}\`).digest("hex")`. Verification uses `crypto.timingSafeEqual` with a length pre-check to avoid the `RangeError` on mismatched buffer lengths. Replay protection via Redis-backed `seenOnce` with 10-min TTL.
- why: No finding — implementation is correct and follows best practices.
- fix: None needed.
- confidence: N/A

---

## RLS Policy Coverage Summary

| Table | SELECT | INSERT | UPDATE | DELETE | Repo uses RLS client? | Status |
|-------|--------|--------|--------|--------|----------------------|--------|
| `disputes` | ✅ 0004 | ✅ 0021 | ❌ MISSING | — | Yes (addEvidence, assignToReview) | **BROKEN** |
| `dispute_evidence` | ✅ 0014 | ✅ 0032 | — | — | Yes | OK |
| `vendor_team_members` | ✅ 0002 | ❌ MISSING | ❌ MISSING | ❌ MISSING | Yes (invite, changeRole, remove) | **BROKEN** |
| `webhook_deliveries` | ✅ 0005 | ❌ MISSING | — | — | Yes (recordDelivery) | **BROKEN** (silent) |
| `webhooks` | ✅ (for all) | ✅ (for all) | ✅ (for all) | ✅ (for all) | Yes | OK |
| `agent_jobs` | ✅ (for all) | ✅ (for all) | ✅ (for all) | ✅ (for all) | Yes | OK |
| `invoices` | ✅ | ✅ 0021 | ✅ 0021 | — | Yes | OK |
| `cashout_orders` | ✅ | ✅ 0021 | ✅ 0021 | — | Yes | OK |

---

## No-Finding Confirmations

- **SQL injection:** No raw SQL anywhere in the app layer. All queries go through Supabase client (parameterized). The only `client.query(sql)` is in `scripts/db-apply.mjs` (admin migration script reading from files, not user input).
- **Command injection:** No `exec()`, `spawn()`, or `child_process` usage in app code. The `$$eval` hits are in Playwright test fixtures only.
- **eval():** Not used in application code. Only present in CSP directive (which should be removed).
- **Secrets in logs/responses:** Webhook URLs are hashed before logging (daemon webhookDelivery.ts:73). Error responses use generic codes, not internal reasons. PagerDuty routing key comes from env, never logged.
- **SSRF redirect following:** Both web (webhooks.ts:90) and daemon (webhookDelivery.ts:108) set `redirect: "manual"` and explicitly reject 3xx responses.
- **Open redirects:** All three redirect paths use the shared `safeRedirect` helper.
