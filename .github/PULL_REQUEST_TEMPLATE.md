<!-- Keep PRs focused. One concern per PR. Refactors land separately from behaviour changes. -->

## What changed and why

<!-- One short paragraph. Lead with the user-visible change, then the reason. -->

## How it was tested

<!-- List the commands you ran + any manual flow you walked. Don't claim "passes CI" — say what you actually did. -->

- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm --filter @klaro/web test` passes
- [ ] `pnpm contracts:test` passes (only if `packages/contracts/` changed)
- [ ] Walked the affected flow in the browser (only if UI changed)

## Risk + rollback

<!-- What's the blast radius if this breaks in production? How would we roll back? -->

## Related

<!-- Closes #N, References #N. Threat-model row if this touches an attack surface. -->

---

By submitting this pull request I confirm my contributions are made under the [Apache-2.0 License](../LICENSE) and that I have read [CONTRIBUTING.md](../CONTRIBUTING.md).
