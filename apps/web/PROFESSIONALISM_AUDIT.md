# Klaro Professionalism Audit — Full Report

**Date:** 2026-05-27  
**Scope:** Entire project — copy, docs, security, code quality, business presentation  
**Goal:** Identify everything that prevents Klaro from looking like a serious, funded company

---

## OVERALL GRADES

| Area | Grade | Summary |
|------|-------|---------|
| Copy & Language | B- | Domain confusion, leaked jargon, misleading claims |
| Documentation | A | Investor-ready, well-structured, no placeholders |
| Security Posture | A- | Production-grade, defence-in-depth, minor RFC gap |
| Code Quality | B+ | Strong architecture, weak linting, beta deps, no UI tests |
| Business Presentation | B+ | Impressive depth, but no team, factual inconsistencies |

---

## 1. COPY & LANGUAGE ISSUES

### Critical — Fix Before Any Public Review

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 1 | **Domain confusion: klaro.so vs klaro.me** | Everywhere | Hero says `i.klaro.me`, Footer links to `klaro.me`, Developers code says `i.klaro.so`, Status page says `klaro.so web`. Pick ONE domain. |
| 2 | **Milestone codes visible to users** — M9, M11, M12 | help, trust, status, en.json, recurring | "Scheduler runs in M9", "wires M11", "ships M12" — meaningless to users |
| 3 | **Spec references visible** — "v2 §29.1", "v2 §4.6", "v2 §16" | admin, trust, ERP pages | Internal document notation leaked to UI |
| 4 | **"All systems operational" is hardcoded** — not from real health check | Hero.tsx | Always shows green regardless of actual status |
| 5 | **"WCAG 2.2 AAA" claim without evidence** | FinalCta.tsx | Extremely high bar; page itself fails AA on brand card |
| 6 | **"SOC 2 Type II · in progress" claim** | FinalCta.tsx | No evidence of engagement; could be legally problematic |
| 7 | **StableFX tagged "Live" in PlatformOS** but "Access-gated" in TruthTable | PlatformOS.tsx vs TruthTable.tsx | Self-contradicting honest labels |
| 8 | **"Live quote" label for simulated feature** | en.json | `"quoteTitle": "Live quote"` but cashout is simulated |
| 9 | **GitHub org mismatch** — `klaro-protocol/incidents` vs `klaro-labs/klaro` | status/page.tsx vs README | Two different org names |
| 10 | **"View on GitHub" links to `/developers`** not actual GitHub | Developers.tsx | Misleading button label |

### High — Terminology & Consistency

| # | Issue | Details |
|---|-------|---------|
| 11 | **4 terms for simulation mode** — "simulator mode", "simulated", "simulation", "demo" | Should pick 2 max: "simulated" (badge) + "demo" (casual) |
| 12 | **3 terms for live mode** — "live-contract mode", "live mode", "contract mode" | Pick one: "live mode" |
| 13 | **"Stenn-Proof" vs "receipt" vs "on-chain receipt" vs "audit receipt"** | 4 names for same thing |
| 14 | **"Partner Cashout" vs "Cashout" vs "Cash out"** | Title case, one word, two words — inconsistent |
| 15 | **"Trust Score" vs "Reputation"** — used interchangeably | Nav says "Reputation", PlatformOS says "Trust Score" |
| 16 | **Tone mismatch** — "Hi, Asha" (mobile) vs "Welcome back, Asha." (desktop) | Same page, different formality |
| 17 | **"marked paid · trust me"** — sarcastic tone in fintech landing | StennProof.tsx | Unprofessional for the context |
| 18 | **"magic-link send failed"** — raw technical error shown to users | signin/page.tsx | Should be "We couldn't send the link. Try again." |

### Medium — Grammar & Phrasing

| # | Issue | Quote |
|---|-------|-------|
| 19 | **"No FX markup we don't disclose"** — awkward double negative | Should be "No undisclosed FX markup" |
| 20 | **"until partner sign"** — incomplete phrase | Should be "until partner sign-off" |
| 21 | **"Pilot live for INR"** — missing verb | Should be "Pilot is live for INR" |
| 22 | **MetricsBand disclaimer is a dev note** — "Replace with verified Arc testnet event aggregates…" | Reads like a TODO, not user copy |

---

## 2. DOCUMENTATION — Grade: A

| Area | Verdict |
|------|---------|
| README structure | ✅ Excellent — stats, features, code samples, repo map |
| .env.example | ✅ Best-in-class — 120+ lines, every var commented |
| SECURITY.md | ✅ Professional — PGP, SLA, scope, disclosure timeline |
| THREAT_MODEL.md | ✅ 13 vectors with test references |
| Runbooks | ✅ 9 runbooks, consistent 8-section schema |
| CONTRIBUTING.md | ✅ Clear getting-started, review checklist |
| CHANGELOG.md | ✅ Keep-a-Changelog format |
| No TODOs in docs | ✅ Clean |
| No leaked secrets | ✅ Clean |

**Only gap:** Verify `CODE_OF_CONDUCT.md` exists (referenced but not checked).

---

## 3. SECURITY POSTURE — Grade: A-

| Area | Status |
|------|--------|
| Security headers (HSTS, CSP, X-Frame-Options) | ✅ Strong |
| Auth (Supabase SSR + role-based + fail-closed) | ✅ Strong |
| Secrets management (centralized, rotatable, timing-safe) | ✅ Strong |
| Error monitoring (Sentry + PII scrubbing) | ✅ Strong |
| Health check endpoint | ✅ Present |
| Rate limiting | ✅ Implemented (in-memory, per-IP) |
| API authentication | ✅ All mutations gated |
| No security anti-patterns | ✅ Clean (no eval, no innerHTML, no raw SQL) |
| security.txt | ⚠️ Missing `Expires:` field (RFC 9116 violation) |
| CSP connect-src | ⚠️ Middleware version broader than next.config version |
| CORS | ⚠️ Not explicitly configured (acceptable for same-origin app) |

---

## 4. CODE QUALITY — Grade: B+

| Area | Status |
|------|--------|
| TypeScript strict mode | ✅ Full strict |
| Error handling | ✅ Excellent (sanitized, layered, Sentry-integrated) |
| Code organization | ✅ 50 focused lib modules, clear separation |
| Environment validation | ✅ Centralized with drift guard test |
| Types | ✅ Well-defined domain types |
| Test coverage (unit) | ✅ 27 test files covering security boundaries |
| Dependency pinning | ⚠️ All use `^` ranges, not exact |
| Beta dependencies | ⚠️ Tailwind v4 beta in production |
| ESLint config | ⚠️ Minimal (only next/core-web-vitals) |
| Component/E2E tests | ❌ None |
| Prettier/formatting | ❌ Not visible |

---

## 5. BUSINESS PRESENTATION — Grade: B+

### What Works (Investor-Ready)

- ✅ Depth of implementation (20 contracts, 500 tests, 37 tables)
- ✅ Honest labeling philosophy — genuinely differentiated
- ✅ Legal pages with real content
- ✅ Trust center with specific commitments
- ✅ Professional OG images and brand kit
- ✅ Live testnet with verifiable deployed contracts
- ✅ Sophisticated architecture (multi-chain, agents, FX, disputes)

### What's Missing (Would Give Investors Pause)

| # | Issue | Impact |
|---|-------|--------|
| 23 | **No team section anywhere** — company page has no people | Anonymous companies don't get funded |
| 24 | **"Klaro Labs Inc." vs "pre-incorporation"** — contradictory | Legal risk + trust issue |
| 25 | **No metrics** — zero users, transactions, or testnet volume shown | No traction signal |
| 26 | **No social proof** — no tweets, press, testimonials, investor logos | No external validation |
| 27 | **Factual inconsistencies** — 15 vs 20 contracts, 26 vs 37 tables | Suggests no editorial review |
| 28 | **Roadmap Q1 items still "wip" in May** — looks behind schedule | Update statuses or adjust quarters |
| 29 | **"$100k bug bounty" promised** before program exists | Creates expectations without delivery |
| 30 | **"ReceivablesPool (real lending)" on roadmap** — regulated activity without disclaimer | Could attract regulator attention |
| 31 | **"Not a bank" disclaimer missing from footer** | Industry standard (Stripe, Mercury, Brex all have it) |
| 32 | **No JSON-LD structured data** | Missed SEO opportunity for rich snippets |
| 33 | **PWA screenshots empty** | Blocks richer Android install experience |
| 34 | **Terms of Service too thin** — missing limitation of liability, governing law | Wouldn't survive legal review |
| 35 | **Privacy policy missing** data retention periods, DPO contact, transfer mechanisms | GDPR gaps |

---

## 6. MISLEADING CLAIMS (Legal Risk)

| # | Claim | Risk | Fix |
|---|-------|------|-----|
| 36 | "Get paid in seconds. Not weeks." | Marketing claim about live product; testnet doesn't pay anyone | Add "on testnet" qualifier or change to "Invoice in seconds" |
| 37 | "Klaro Labs Inc." | Using "Inc." before incorporation = misrepresentation | Remove "Inc." until incorporated |
| 38 | "INR pilot live" (LLMs.txt) | Contradicts disclosures (mainnet-only for fiat) | Fix to "INR pilot simulated" |
| 39 | "$100k bug bounty" | Promising amount before program exists | Add "(planned)" |
| 40 | "99.9% uptime SLA target" | If in any contract, becomes binding | Keep "target" language, never put in ToS |
| 41 | "WCAG 2.2 AAA" | Page fails AA on brand card; claiming AAA is false | Remove or change to "WCAG 2.1 AA target" |
| 42 | "SOC 2 Type II · in progress" | No evidence of engagement | Change to "SOC 2 planned" or remove |
| 43 | "All systems operational" (hardcoded) | Implies real monitoring; it's static | Connect to actual health check or remove |

---

## 7. BRAND CONSISTENCY ISSUES

| # | Issue | Details |
|---|-------|---------|
| 44 | **Two domains** — klaro.so and klaro.me used interchangeably | Pick one canonical domain |
| 45 | **Two GitHub orgs** — klaro-labs and klaro-protocol | Pick one |
| 46 | **Twitter @klaro_xyz** doesn't match either domain | Should be @klaro_so or @klarolabs |
| 47 | **Three taglines** — "Get paid in seconds", "USDC invoicing on Arc", "Get paid in USDC. Cash out in INR." | Pick one primary, use others as supporting |
| 48 | **Contract count: 15 vs 20** — LLMs.txt vs README | Verify and unify |
| 49 | **Table count: 26 vs 37** — roadmap vs README | Verify and unify |
| 50 | **Company entity: "Klaro Labs Inc." vs "Klaro Labs" vs "pre-incorporation"** | Resolve legal status, use consistently |

---

## PRIORITY FIX ORDER

### Immediate (Before any public sharing)
1. Fix domain confusion — pick `klaro.so`, update all references
2. Remove all milestone codes from user-facing text (M9, M11, M12)
3. Remove spec references from UI (v2 §29.1, etc.)
4. Fix "Klaro Labs Inc." → "Klaro Labs" until incorporated
5. Remove "WCAG 2.2 AAA" claim
6. Fix StableFX "Live" vs "Access-gated" contradiction
7. Fix factual inconsistencies (contract/table counts)

### Before Investor/Judge Review
8. Add team section to company page
9. Add "not a bank" to site footer
10. Update roadmap statuses (Q1 items shouldn't be "wip" in May)
11. Remove or qualify "SOC 2 Type II" claim
12. Add `Expires:` to security.txt
13. Standardize terminology (pick one term for simulation, one for receipts)
14. Fix "View on GitHub" to link to actual repo

### Before Mainnet
15. Full legal review of Terms of Service
16. Add data retention periods to Privacy Policy
17. Add JSON-LD structured data
18. Pin dependencies to exact versions
19. Add component/E2E tests
20. Implement nonce-based CSP (remove unsafe-eval)

---

## WHAT'S ALREADY PROFESSIONAL

- ✅ Documentation is investor-grade (README, SECURITY, THREAT_MODEL, runbooks)
- ✅ Security posture would pass a first-impression audit
- ✅ Error handling is production-grade (sanitized, layered, monitored)
- ✅ Honest labeling philosophy is genuinely differentiated
- ✅ Code architecture is clean (50 focused modules, clear separation)
- ✅ Environment validation with drift guards is best-in-class
- ✅ Legal pages exist with real content (not placeholder)
- ✅ Brand design system is sophisticated (tokens, CVA, responsive)
- ✅ OG images and metadata are well-crafted
- ✅ Robots.txt and sitemap are properly configured
- ✅ No leaked secrets, no debug code, no TODO comments in docs


---

## FIRST-PERSON PERSPECTIVE AUDIT

### 5 personas simulated their first encounter with Klaro:

---

### 🏦 INVESTOR (VC seeing it for the first time)

**Would take the meeting:** Yes. Engineering quality is top 5%.

**Red flags they'd raise:**
| # | Issue | Severity |
|---|-------|----------|
| 51 | **No team visible anywhere** — "Who am I giving money to?" | Dealbreaker |
| 52 | **Zero traction evidence** — no users, no testimonials, no metrics | High |
| 53 | **Cashout depends on unsigned partners** — core value prop is "partner pending" | High |
| 54 | **Feature sprawl** — 20 contracts + agents + FX + disputes for a pre-revenue project | Medium |
| 55 | **Trust strip is just text** — lists standards, not partner logos | Medium |
| 56 | **17 landing sections is too many** — attention span exceeded | Low |

**One-liner for partner meeting:** "Exceptional engineer, complete protocol, zero traction, zero team visibility. Worth a call if they can show market pull."

---

### 👨‍💻 SENIOR DEVELOPER (evaluating the repo)

**Would join the team:** Yes. Score: 8.5/10.

**What impressed them most:**
- env.ts drift guard test ("tells me more about engineering culture than any README")
- Architectural guard tests (no-mock-in-production, PII surface, TOCTOU race)
- Security-first middleware (headers on every response including 429s)
- "Comments tell stories" — every non-obvious decision has a "why"

**Concerns they'd raise:**
| # | Issue |
|---|-------|
| 57 | Tailwind v4 beta with caret ranges — pin these |
| 58 | `asChild` prop declared on Button but never implemented — dead code |
| 59 | No E2E tests (Playwright/Cypress) |
| 60 | Hardcoded INR exchange rate (83.4) in UI code |
| 61 | auth.ts mixes client and server functions in one file |

---

### 👩‍🎨 FREELANCE DESIGNER IN MUMBAI (target user)

**Would sign up:** Yes. **Would stay:** No — "it's not real yet."

**What confused/scared them:**
| # | Issue | Quote |
|---|-------|-------|
| 62 | **"USDC" never explained** — "Is it dollars? Is it crypto?" | "Nobody explains this on the screen" |
| 63 | **"Testnet" means nothing** — "Is this a real product or a demo?" | "I'd think 'this isn't ready' and never come back" |
| 64 | **"ERC-20 interface (6 decimals)"** in invoice form | "Terrifying jargon for a designer" |
| 65 | **"LP" never spelled out** — "In my world LP means vinyl records" | Should say "payout partner" |
| 66 | **"Confirm simulated cashout"** as primary CTA | "A real product says 'Cash out ₹2,01,360'" |
| 67 | **"Sim" badge feels like an error state** | "Did I do something wrong?" |
| 68 | **No path from demo to real** — "When can I actually get paid?" | No waitlist, no ETA, no "go live" button |
| 69 | **Unicode nav icons (⌂▤↗◉)** | "Every real fintech app uses proper icons" |
| 70 | **"Cashout" sounds like a casino** | In India: "Withdraw" or "Transfer to bank" |

**The fundamental tension:** "Klaro is built on crypto rails but targets non-crypto users. Every crypto term is a speed bump that says 'this isn't for you.'"

---

### 💳 BUYER (received an invoice link)

**Would pay:** Yes, if they trust the vendor. Trust score: 7.5/10.

**What made them suspicious:**
| # | Issue |
|---|-------|
| 71 | **Vendor shown as hex address** — "I can't verify this is Acme Corp" |
| 72 | **No vendor logo or verified business name** — "A scammer could set this up" |
| 73 | **Three wallet popups** (sign + approve + send) — "Is this draining me?" |
| 74 | **Auto-redirect after 1.8s** — "I wanted to copy the tx hash first" |
| 75 | **"Stenn-Proof" unexplained** — "Is this a real standard or something they made up?" |
| 76 | **No PDF download on receipt** — "My accountant needs a document" |
| 77 | **No email confirmation** — "PayPal sends me a receipt automatically" |
| 78 | **No legal entity name on receipt** — "Just wallet addresses, not 'Acme Corp'" |

---

### 🏆 HACKATHON JUDGE (5-minute evaluation)

**Score: 46/50** — Top-3 submission.

| Criterion | Score |
|-----------|-------|
| Innovation | 9/10 |
| Execution | 9/10 |
| Design | 9/10 |
| Use of Sponsor Tech | 10/10 |
| Completeness | 9/10 |

**Single biggest weakness:** "Where's the proof anyone has actually used this? No explorer link showing a real test transaction flow. Every receipt says 'Not settled.' A skeptical judge could argue this is an elaborate static site with deployed-but-unused contracts."

**What would win:** One explorer link showing invoice → accept → settle → receipt-mint flow.

---

## TOP UNPROFESSIONAL THINGS DETECTED (across all 5 personas)

### Things that make people CLOSE THE TAB:

1. **No team/founder visible** — investors won't proceed
2. **"Testnet" / "Simulated" without context** — users think it's not ready
3. **Crypto jargon for non-crypto users** — USDC, ERC-20, LP, Arc, on-chain
4. **No proof of real usage** — no explorer links, no transaction evidence
5. **"Klaro Labs Inc." while pre-incorporation** — legal misrepresentation

### Things that make people SKEPTICAL:

6. **Trust strip is text, not logos** — doesn't prove partnerships
7. **Vendor identity is just a hex address** — buyers can't verify
8. **No PDF receipt download** — accountants need documents
9. **"Confirm simulated cashout" as a CTA** — sounds fake
10. **Unicode icons in mobile nav** — signals prototype, not product

### Things that IMPRESS across all personas:

1. **Honest mode labelling** — genuinely differentiated, builds trust
2. **Engineering depth** — 500 tests, threat models, drift guards
3. **Mobile-first design** — dark signin, bottom nav, cashout state machine
4. **The Stenn collapse narrative** — real-world problem framing
5. **Zero-config local dev** — `pnpm dev` just works
