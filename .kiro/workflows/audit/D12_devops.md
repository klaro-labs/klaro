# D12 — DevOps / Release-Engineering Audit

**Auditor:** d12_devops  
**Date:** 2026-05-31  
**Scope:** CI pipeline, build reproducibility, env-var management, secret handling, monitoring/alerting, rollback/DLQ-replay, dependency pinning/supply-chain, runbook completeness.

## Summary

The CI pipeline covers contracts (forge test), web (typecheck + vitest + build), daemon (typecheck + vitest + build), and an arc-address-drift soft-check. However, **linting and formatting are not gated on PR** — the root `package.json` defines `lint` and `format:check` scripts but CI never runs them. The Dockerfile uses an unpinned `pnpm@latest` which breaks reproducibility. There is no DLQ replay runbook or admin UI despite a mature DLQ persistence layer. Dependency version ranges across packages are inconsistent (viem pinned in web, caret in daemon/sdk/cli). No rollback procedure is documented for either web (Vercel) or daemon (Railway). Monitoring relies on optional env vars (PagerDuty, Sentry) with no CI enforcement that they are set in production.

---

## Findings

### [SEV-2] Lint and format checks not gated on PR
- file: .github/workflows/ci.yml (entire file — no `lint` or `format` step)
- lens: devops
- what: The CI workflow runs `typecheck`, `test`, and `build` for web and daemon, and `forge test` for contracts, but never runs `pnpm lint`, `pnpm format:check`, or `forge fmt --check`. These scripts exist in `package.json:8-9` (root) and `apps/web/package.json:9` and `packages/contracts/package.json:13`.
- why: Style regressions, unused imports, and formatting drift merge unchecked. Developers must remember to run locally — no enforcement.
- fix: Add a `lint` job (or step in existing jobs): `pnpm -r lint && pnpm format:check && forge fmt --check --root packages/contracts`.
- confidence: high

### [SEV-2] No E2E / Playwright tests in CI
- file: package.json:18 (`"playwright": "^1.60.0"` in devDependencies)
- lens: devops
- what: Playwright is installed as a root dev dependency but no CI job runs E2E tests. The README claims 56 routes; none are integration-tested in the pipeline.
- why: UI regressions, broken wallet flows, and routing errors ship undetected. Unit tests (vitest) cover logic but not rendered pages or wallet interactions.
- fix: Add a `e2e` job that boots the app in simulated mode and runs a Playwright suite against critical paths (invoice creation, payment, receipt view).
- confidence: high

### [SEV-2] Dockerfile uses unpinned `pnpm@latest`
- file: apps/daemon/Dockerfile:4
- lens: devops
- what: `RUN corepack enable && corepack prepare pnpm@latest --activate` — the pnpm version changes on every build depending on when the image is built.
- why: Breaks reproducibility. A new pnpm major could change lockfile format, resolution algorithm, or CLI flags, causing silent build differences or failures.
- fix: Pin to the same version as `packageManager` in root `package.json`: `corepack prepare pnpm@10.32.1 --activate`.
- confidence: high

### [SEV-2] No rollback procedure documented (web or daemon)
- file: DEPLOYMENT.md:73-78 (web section) and DEPLOYMENT.md:82-85 (daemon section)
- lens: devops
- what: DEPLOYMENT.md states "Production is promoted manually" for web and "deploys to a long-lived runtime" for daemon, but neither section documents how to roll back a bad deploy. No `vercel rollback` command, no Railway rollback procedure, no git-revert-and-redeploy playbook.
- why: During an incident caused by a bad deploy, operators have no documented fast-path to restore the previous version. Time-to-recovery increases.
- fix: Add a "Rollback" subsection to both web and daemon deployment docs: Vercel instant rollback via dashboard/CLI, Railway redeploy-from-commit, and contract rollback (which is covered by `contract-upgrade.md` but should be cross-referenced).
- confidence: high

### [SEV-2] No DLQ replay runbook or admin UI
- file: apps/daemon/src/workers/_dlq.ts:1-6 (DLQ persists to `dead_letter_jobs`)
- lens: devops
- what: The daemon persists failed jobs to a `dead_letter_jobs` Supabase table and pages via PagerDuty when backlog exceeds 10. However, there is no runbook in `docs/runbooks/` for DLQ triage, no admin UI route for viewing/replaying dead-lettered jobs, and no CLI command or script to requeue them.
- why: When an operator is paged for DLQ backlog, they have no documented procedure to inspect, triage, or replay jobs. The pricing page (`lib/pricing.ts:105`) mentions "DLQ replay" as a feature but it doesn't exist.
- fix: (1) Add `docs/runbooks/dlq-replay.md` covering: how to query `dead_letter_jobs`, how to replay (re-enqueue via BullMQ), when to discard, escalation. (2) Add an admin API route or CLI script for replay.
- confidence: high

### [SEV-3] Inconsistent viem version pinning across packages
- file: apps/web/package.json:40 (`"viem": "2.50.4"` — exact), apps/daemon/package.json:20 (`"viem": "^2.32.0"` — caret), packages/sdk/package.json:36 (`"viem": "^2.20.0"` — peer, caret), packages/cli/package.json:14 (`"viem": "^2.20.0"` — caret)
- lens: devops
- what: The web app pins viem exactly (good), but daemon uses a caret range. In a monorepo with a single lockfile this is partially mitigated, but if daemon is deployed independently (Docker build copies only its subtree), resolution may differ.
- why: ABI encoding/decoding behavior can change between viem minors. A daemon running a different viem version than web could produce incompatible transaction data.
- fix: Pin viem to an exact version in daemon's `package.json` (matching web), or add a `pnpm.overrides` entry in root to force a single version workspace-wide.
- confidence: medium

### [SEV-3] Dockerfile base image not pinned to digest
- file: apps/daemon/Dockerfile:2,11
- what: `FROM node:22-alpine` uses a mutable tag. The underlying image changes weekly as Alpine and Node publish patches.
- why: A base image update could introduce a breaking change or vulnerability without any code change in the repo. Builds are not reproducible across time.
- fix: Pin to a specific digest: `FROM node:22-alpine@sha256:<digest>` and update via Dependabot (already configured for GitHub Actions, extend to Docker).
- confidence: medium

### [SEV-3] No dependency audit step in CI
- file: .github/workflows/ci.yml (entire file)
- lens: devops
- what: CI never runs `pnpm audit` or any SCA tool (Snyk, Socket, npm audit). Dependabot handles updates but does not block PRs that introduce known-vulnerable transitive deps.
- why: A PR could add or upgrade a dependency with a known CVE and merge without warning.
- fix: Add `pnpm audit --audit-level=high` as a CI step (can be `continue-on-error: true` initially to avoid blocking on pre-existing advisories).
- confidence: medium

### [SEV-3] Arc address drift job is soft-fail only
- file: .github/workflows/ci.yml:89 (`continue-on-error: true`)
- lens: devops
- what: The `drift-check` job uses `continue-on-error: true`, meaning a stale or moved address never blocks a PR merge. The comment explains the rationale (llms.txt index unreliable), but the effect is that address drift is advisory-only.
- why: If a pinned address in `KlaroConfig.sol` becomes stale (Circle redeploys USDC, changes a router), the CI will warn in the job summary but the PR merges green. Operators may miss the warning.
- fix: (1) Add a Slack/Discord notification on drift-check failure so it's not buried in CI logs. (2) Consider promoting to hard-fail once docs.arc.io stabilizes, or gate on a subset of critical addresses (USDC, CCTP).
- confidence: medium

### [SEV-3] No CI caching for pnpm store
- file: .github/workflows/ci.yml:24-26, 51-53, 78-80
- lens: devops
- what: Each job runs `pnpm install --frozen-lockfile` without caching the pnpm store. Three jobs × full install on every PR.
- why: CI is slower than necessary (network-bound npm registry fetches on every run). Not a correctness issue but impacts developer velocity and CI cost.
- fix: Add `actions/cache` for `~/.local/share/pnpm/store` keyed on `pnpm-lock.yaml` hash, or use `pnpm/action-setup@v4`'s built-in cache support.
- confidence: high

### [SEV-3] PagerDuty and Sentry are optional with no production enforcement
- file: apps/daemon/.env.example:39-40 (`PAGERDUTY_INTEGRATION_KEY` and `SENTRY_DSN` marked `# optional`)
- lens: devops
- what: Both alerting integrations are optional. The daemon boots and runs without them. There is no startup warning or CI check that production deployments have these set.
- why: A production daemon could run for weeks with no alerting. DLQ backlog pages would silently skip (`dlq.pagerduty.skipped` log line only). Errors would not surface to Sentry.
- fix: (1) In `env.ts`, emit a loud startup warning (or fail) when `NODE_ENV=production` and these are unset. (2) Add a deployment checklist in DEPLOYMENT.md listing required-for-production env vars.
- confidence: medium

### [SEV-3] No smoke test after deploy (web or daemon)
- file: DEPLOYMENT.md:73-85
- lens: devops
- what: Neither the web nor daemon deployment sections mention a post-deploy smoke test or canary check. Vercel preview URLs exist but no automated verification runs against them.
- why: A deploy that passes CI but fails at runtime (missing env var, bad wiring) is not caught until a user reports it or an alert fires (if alerting is configured).
- fix: Add a post-deploy step: hit `/api/health` for web, hit `/healthz` for daemon, verify 200. Can be a GitHub Actions workflow triggered on deploy webhook.
- confidence: medium

### [SEV-3] Daemon env.ts allows testnet private key in production
- file: apps/daemon/.env.example:33 (`DAEMON_OPERATOR_PRIVATE_KEY= # optional (local keystore — testnet only)`)
- lens: devops
- what: The comment says "testnet only" but `env.ts` (line 50 area) does not enforce this — the key is accepted regardless of `NODE_ENV`. An operator could accidentally deploy to production with a raw private key instead of Circle Wallets.
- why: Private key in env vars on a production host is a single-point-of-compromise risk. If the host is breached, the operator key is exposed.
- fix: In `env.ts`, reject `DAEMON_OPERATOR_PRIVATE_KEY` when `NODE_ENV=production` (force Circle Wallets path). Or at minimum emit a sev-1 startup warning.
- confidence: medium

### [SEV-4] vercel.json only defines one cron
- file: apps/web/vercel.json:1-7
- lens: devops
- what: Only `lifecycle-reminders` is defined as a Vercel cron. If other scheduled tasks exist (e.g., `disputeSlaWatcher`, `cashoutStuckWatcher` mentioned in runbooks), they run only in the daemon — but there's no documentation mapping which crons run where.
- why: Operator confusion about which process owns which scheduled task. If daemon is down, the cron gap is invisible.
- fix: Add a "Scheduled tasks" section to DEPLOYMENT.md mapping each cron/watcher to its owning process (web cron vs daemon poll loop).
- confidence: low

### [SEV-4] Foundry lib dependencies cloned by branch tag, not commit hash
- file: .github/workflows/ci.yml:29-30
- lens: devops
- what: `git clone --depth 1 --branch v1.9.4 https://github.com/foundry-rs/forge-std` and `--branch v5.1.0 ... openzeppelin-contracts`. Tags are mutable (can be force-pushed).
- why: Extremely unlikely for major repos, but a compromised tag could inject malicious code into the build. Commit-hash pinning is the gold standard for supply-chain security.
- fix: Pin to commit SHA: `git clone ... && cd lib/forge-std && git checkout <sha>`. Or use a `soldeer.lock` / git submodules with pinned commits.
- confidence: low

### [SEV-4] No CODEOWNERS file
- file: (missing) .github/CODEOWNERS
- lens: devops
- what: No CODEOWNERS file exists to enforce review requirements on sensitive paths (contracts, daemon, CI workflows, env schemas).
- why: Any team member can merge changes to critical infrastructure (deploy scripts, CI config, contract code) without mandatory review from domain owners.
- fix: Add `.github/CODEOWNERS` mapping `packages/contracts/` → contracts team, `.github/workflows/` → devops, `apps/daemon/` → backend, etc.
- confidence: medium

---

## Positive observations

- **Frozen lockfile enforced** in all CI jobs (`.github/workflows/ci.yml:26,53,80`).
- **Dependabot configured** for both npm and GitHub Actions (`.github/dependabot.yml`).
- **pnpm overrides** patch known CVEs in transitive deps (`package.json:55-60`).
- **Daemon has a proper healthcheck** (Dockerfile HEALTHCHECK + Railway config + `/healthz` endpoint).
- **Web has a health endpoint** (`/api/health`) that verifies Supabase reachability.
- **DLQ persistence + PagerDuty alerting** is implemented with cross-replica dedup and shutdown-safe abort.
- **Runbooks are comprehensive** — 9 runbooks covering all major incident classes, each following a consistent 8-section schema.
- **Security headers** are well-configured in `next.config.mjs` with proper CSP, HSTS, and frame-ancestors handling.
- **Sentry integration** covers server, edge, and client with PII scrubbing.
- **Arc drift check** is a novel and valuable CI job even in soft-fail mode.
- **Cron endpoint is auth-gated** with `CRON_SECRET` in production.
