# ledger-web

A small Express app standing in for a mid-size fintech's codebase, seeded
with deliberately messy feature-flag patterns. Built as the target repo
for the **Flag Guardian** MVP (Factory.ai Candidate Assignment 1).

## Why it's messy on purpose

Real audits don't find one tidy problem — they find a pile of different
ones. This repo seeds seven distinct patterns so a governance scanner has
something real to catch:

| File | Flag | Pattern |
|---|---|---|
| `routes/checkout.js` | `ledger.newCheckoutFlow` | **Healthy control case** — owned, fallback, active experiment |
| `services/dashboard.js` | `FEATURE_NEW_DASHBOARD_ENABLED` | Hardcoded boolean, bypasses governance entirely |
| `services/refunds.js` | `payments.legacyRefundPath` | No fallback — single point of failure |
| `services/pricing.js` | `pricing.dynamicDiscountV2` | Rolled to 100% ~11 months ago, dead branch never removed |
| `legacy/search.js` | `search.legacyElasticQuery` | Commented-out, pure dead code |
| `services/kyc.js` | `kyc.oldVerificationFlow` | Overdue TODO-dated removal (compliance-relevant) |
| `flags.config.json` | `notifications.smsFallbackDisabled` | Orphaned in config, no code references |
| `flags.config.json` | `reporting.exportV3` | Orphaned in config, no code references |

## Running it

```bash
npm install
npm test      # tests/basic.test.js
npm start     # server on :3000
```

## Note for whoever (human or droid) works on this repo

See `AGENTS.md` before scanning or modifying flag code.
