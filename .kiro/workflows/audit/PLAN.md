# Klaro — Company-Level Codebase Audit Plan

Goal: audit **every line** of the Klaro codebase from the point of view of a full
company org, so anything wrong surfaces. Read-only analysis. Findings are
written to per-department markdown files, then consolidated into
`MASTER_AUDIT.md`, severity-ranked with a fix backlog.

## Codebase surface (grounds the allocation)

| Area | Files | LOC |
|---|---|---|
| `apps/web/app` (routes, server actions, API) | 185 | 21,054 |
| `apps/web/lib` (repos, auth, arc, money, env) | 61 | 10,838 |
| `apps/web/components` | 63 | 6,527 |
| `apps/web/test` | 28 | 1,971 |
| `apps/daemon/src` (listener, workers, queue) | 24 | 3,842 |
| `packages/contracts/src` | 25 | 4,904 |
| `packages/contracts/test` | 47 | 7,425 |
| `packages/sdk/src` | 6 | 474 |
| `apps/web/supabase/migrations` | 34 | 1,592 |
| **Total (auditable source)** | **~473** | **~58,600** |

(`packages/cli` is vendored deps — out of scope.)

## Org structure — 13 departments, ~120 analyst roles

Each role owns a **code slice + a lens** and writes findings to its department
file. Roles are the cumulative catalog; they execute in **batches of ≤4 agents**
(orchestration cap), department by department.

| # | Department | Roles | Code slice | Output file |
|---|---|---|---|---|
| D1 | Executive (Founder/Co-founder/CTO) | 6 | whole-repo posture, claims-vs-reality, mission/honest-mode | `D1_executive.md` |
| D2 | Smart-Contract Engineering | 12 | `packages/contracts/src/*` by contract cluster | `D2_contracts_eng.md` |
| D3 | Smart-Contract Security (audit-firm POV) | 10 | `packages/contracts/src/*` × attack classes | `D3_contracts_sec.md` |
| D4 | Backend / Daemon Engineering | 10 | `apps/daemon/src/*` | `D4_daemon.md` |
| D5 | Frontend / Web Engineering | 12 | `apps/web/app/*`, `components/*` | `D5_frontend.md` |
| D6 | Database / Data Engineering | 8 | `migrations/*`, `lib/repo/*`, RLS | `D6_database.md` |
| D7 | Security (AppSec) | 10 | web+daemon auth, secrets, SSRF, deps | `D7_appsec.md` |
| D8 | Money-Flow Correctness (state machines) | 8 | invoice/cashout/refund/dispute/agent/fee/FX | `D8_moneyflow.md` |
| D9 | Honest-Mode / Labeling Integrity | 6 | live/sim/partner labels, mock leaks, copy | `D9_honestmode.md` |
| D10 | QA / Testing | 8 | `test/*` both suites, coverage gaps | `D10_qa.md` |
| D11 | Design / UX / Accessibility | 8 | `components/*`, route UX, a11y, mobile | `D11_design.md` |
| D12 | DevOps / Infra / Release | 6 | CI, build, env, runbooks, monitoring | `D12_devops.md` |
| D13 | Compliance / Legal / Docs | 6 | KYB/AML posture, disclaimers, threat model, docs | `D13_compliance.md` |

Total: **110 roles** (≈ the "~130" target; expandable per department if a slice is dense).

## Batching strategy

- Hard cap: **4 concurrent agents**. Each `subagent` call launches one batch (≤4 parallel stages).
- Order by risk: **D3 → D8 → D7 → D6 → D2 → D4 → D5 → D9 → D10 → D13 → D11 → D12 → D1**.
- Each agent gets: its lens, an explicit file slice, the finding format, and its output file path.
- Agents **append** to their department file (each finding self-contained), so partial progress survives.
- After each department, I checkpoint progress here.

## Finding format (every agent uses this)

```
### [SEV] <short title>
- file: <path>:<line>
- lens: <role>
- what: <the problem, concretely>
- why: <impact / exploit / failure mode>
- fix: <concrete remedy>
- confidence: <high|med|low>
```

Severity: **CRITICAL** (funds loss / RCE / auth bypass) · **HIGH** (security/correctness, exploitable) · **MEDIUM** (bug/again under edge) · **LOW** (quality/perf) · **INFO** (note).

## Consolidation

`MASTER_AUDIT.md`: dedup across departments, rank by severity, cross-check against
the stale `KLARO_FULL_AUDIT_2026-05-30.md` (mark already-fixed), and emit a
prioritized fix backlog with owners (department) and effort estimate.

## Status checkpoints

- [ ] D3 Smart-Contract Security
- [ ] D8 Money-Flow Correctness
- [ ] D7 AppSec
- [ ] D6 Database
- [ ] D2 Contracts Engineering
- [ ] D4 Daemon
- [ ] D5 Frontend
- [ ] D9 Honest-Mode
- [ ] D10 QA
- [ ] D13 Compliance
- [ ] D11 Design
- [ ] D12 DevOps
- [ ] D1 Executive
- [ ] MASTER_AUDIT consolidation
