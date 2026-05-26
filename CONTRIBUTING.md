# Contributing to Klaro

Thanks for taking the time to contribute. This document covers the workflow, expectations, and review process for changes to this repository.

## Code of conduct

Participation in this project is governed by the [Contributor Covenant](CODE_OF_CONDUCT.md). By contributing, you agree to its terms.

## Before you start

- Open or comment on a GitHub issue describing the change. For non-trivial work, please get a maintainer reaction before opening a pull request.
- Security findings: do **not** file a public issue. See [`SECURITY.md`](SECURITY.md).

## Development setup

```bash
git clone https://github.com/klaro-labs/klaro
cd klaro
pnpm install
pnpm contracts:build         # compile Solidity
pnpm dev                     # web app on http://localhost:3000
```

You need Node 22+, pnpm 10+, and [Foundry](https://book.getfoundry.sh/) for contract work.

## Branching + commits

- Branch off `main`. Name branches `<type>/<short-description>` (`fix/lp-claim-race`, `feat/agent-job-page`, `chore/dep-bump-viem`).
- Commit subject lines are imperative and ≤ 70 characters. Bodies (optional) explain *why*, not *what*.
- One logical change per commit. Use `git rebase -i` to clean up before pushing.

## Pull requests

- Each PR title is descriptive and ≤ 70 characters.
- PR descriptions cover:
  - What changed and why
  - How it was tested (unit tests, manual flow, fork simulation)
  - Any breaking changes or migration steps
- Link the issue it resolves (`Closes #123`).
- Keep PRs focused. One concern per PR. Large mechanical refactors land separately from behavioural changes.

## Required checks before review

```bash
pnpm typecheck               # all packages
pnpm lint                    # all packages
pnpm --filter @klaro/web test
pnpm contracts:test          # Foundry suite
```

CI runs the same checks; reviewers ignore PRs that do not pass locally.

## Smart-contract changes

- Every external state-mutating function needs a Foundry test covering the happy path **and** at least one revert path.
- New attack vectors require a row in [`packages/contracts/THREAT_MODEL.md`](packages/contracts/THREAT_MODEL.md).
- Symbolic / fuzz coverage (Halmos, Echidna) should not regress. Run the relevant target before requesting review.
- If a change adds or removes a deployed contract address, update [`DEPLOYMENT.md`](DEPLOYMENT.md) in the same PR.

## Style

- TypeScript / React: Prettier defaults. ESLint passes clean. Server actions use Zod for input validation. Identity is resolved server-side — never trust client-supplied vendor / LP / admin ids.
- Solidity: `forge fmt` clean. Custom errors over revert strings. NatSpec is one short line on every external function; no multi-paragraph docstrings.
- Comments: explain *why*, not *what*. Default is no comment.
- No emoji in code, comments, or commit messages.

## Reviewer checklist

Reviewers look for:

1. The change does what its PR description says
2. Tests cover the new behaviour + at least one failure mode
3. No silent failure paths (every catch has either a handled error or a deliberate rethrow with context)
4. RLS or auth boundaries are honoured (server actions call `requireVendor()` / `requireOperator()`)
5. No secret leakage (no service-role keys, private keys, or live credentials in commits, configs, or `.env.example` files)
6. Documentation in `docs/`, `README.md`, or `THREAT_MODEL.md` updated when behaviour or addresses change

## Release process

Klaro tags on `main`. Each tag triggers a Vercel production deployment of the web app and (when contracts change) a Foundry broadcast against the configured network. Release notes follow [Keep a Changelog](https://keepachangelog.com/) format.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0 (see [`LICENSE`](LICENSE)).
