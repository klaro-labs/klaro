# Klaro Professionalism Plan

This file is the master checklist for making Klaro feel, behave, and present like a serious product. It is not a feature wishlist. It lists the work that removes visible, functional, documentation, and trust gaps.

## Current Focus

### 1. UI parity

- Match the provided HTML mockups exactly where they exist.
- Source files:
  - `internal/designer/landing/index.html` - desktop landing page.
  - `internal/designer/brand-kit/index.html` - brand system page.
  - `internal/designer/mobile/index.html` - mobile/PWA reference at 390x844.
- Do not invent unprovided designs.
- Do not use the desktop mockup as mobile source unless explicitly instructed.
- Do not use the mobile mockup as desktop source unless explicitly instructed.
- Fix every visible mismatch in layout, spacing, typography, color, cards, buttons, logo, favicon, assets, header, footer, and section order.
- Make all real app pages feel polished, especially vendor, buyer invoice, receipt, cashout, dispute, admin, docs, trust, and onboarding.

### 2. Demo flow

- Vendor can sign in or use labelled demo access.
- Vendor can create an invoice.
- Buyer can open the hosted invoice.
- Buyer can pay through the current testnet/simulated path without fake live-money claims.
- Receipt appears and verifies correctly.
- Vendor can open cashout simulation.
- Cashout, dispute, and admin recovery screens do not dead-end.
- No dead buttons, fake success, broken links, confusing empty states, or hidden failures.
- Demo mode must never pretend simulated money movement is real settlement.

## Core Product Work To Create Or Finish

### Public-facing deliverables

- Polished landing page matching the supplied mockup.
- Brand kit page matching the supplied mockup.
- Mobile/PWA experience matching the supplied mobile mockup.
- Product page that explains invoices, receipts, cashout, disputes, and reputation in simple language.
- Trust/status page showing live, simulated, access-pending, and planned surfaces.
- Demo walkthrough page or guided flow.
- Screenshots that match the real implemented UI.
- Short product video or GIF showing the full demo flow.
- Product paper as a polished PDF, not only Markdown.
- Pitch deck as a polished PDF/PPTX, not only notes.
- One-page founder/product brief for quick review by investors, partners, or grant reviewers.

### Developer and GitHub deliverables

- README with exact product status, screenshots, quick start, demo route, architecture, and truth labels.
- Architecture document explaining web app, daemon, contracts, database, Arc, Circle, and SDK.
- User-flow document covering vendor, buyer, receipt, cashout, dispute, admin, LP, and agent flows.
- API documentation or OpenAPI page with working examples.
- SDK documentation with install, verify receipt, create invoice, and cashout examples.
- CONTRIBUTING guide with local setup, tests, coding rules, and PR rules.
- CHANGELOG with shipped improvements.
- ROADMAP with honest next steps.
- Deployment and rollback guide.
- Test/QA plan showing what has been verified.
- Demo seed/reset instructions so reviewers can reproduce the same flow.

### Financial and Web3 product deliverables

- Clear testnet truth table for every money path.
- Arc testnet contract address page.
- Contract deployment verification checklist.
- Contract test evidence.
- Escrow and dispute flow explanation.
- Receipt verification explanation.
- Cashout simulation disclosure.
- Partner-pending disclosure where real payout partners are not live.
- Reconciliation checklist for invoice, receipt, cashout, and dispute states.
- Wallet setup and recovery explanation.
- Chain/wrong-wallet/wrong-network failure states.

### Security and trust deliverables

Keep this as a later gate for now, but do not forget it.

- Real WebAuthn/passkey cryptographic verification before claiming passkeys are real authentication.
- No simulated screening, proof verification, or compliance process can settle/release funds in live mode.
- Contract dispute enforcement must always obey recorded outcomes.
- Multisig ownership and fee-receiver wiring must be verified after deployment.
- SECURITY.md with a real reporting contact.
- Threat model and known limitations.
- Dependency scanning and CI security checks.
- Monitoring, alerting, dead-letter queues, and incident runbooks.
- External smart contract audit before any real-money claim.

## Current Known Blockers

### Immediate blockers for current focus

- Supplied UI parity still needs continuous visual comparison and fixes.
- Mobile vendor/product experience must match the provided 390x844 mobile direction.
- Demo flow must stay fully runnable from a fresh clone or labelled demo environment.
- Live/demo labels must remain honest on every screen.

### Later production blockers

- Passkey verification must be real cryptographic verification before production authentication claims.
- Any live fund movement must fail closed if screening, proof verification, or settlement evidence is missing.
- Contract tests must be verified in the local/CI environment with Foundry available.
- Deployment docs and actual deployment scripts must stay consistent.
- Real offchain invoice/customer data must not be mixed with live chain status unless clearly labelled.

## Highest-Value Order

1. Finish UI parity against the provided mockups.
2. Make the complete demo flow reliable end to end.
3. Remove every confusing screen, dead button, broken link, and weak empty/error/loading state.
4. Clean README, screenshots, docs, product paper PDF, and pitch deck.
5. Verify contract, daemon, auth, deployment, monitoring, and security gates before claiming production readiness.

## Quality Rule

Klaro is professional only when a visitor, user, developer, investor, and security reviewer all see the same thing:

- The product is clear.
- The demo works.
- The visuals match the approved design.
- The claims are honest.
- The risks are labelled.
- The repo is easy to review.
- The remaining production work is explicit.
