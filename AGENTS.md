# Project instructions

## What this repo is

A small Express app standing in for a mid-size fintech's codebase.
It is seeded with real feature-flag governance problems on purpose —
see README.md for the full list. Your job here is to build **Flag
Guardian**: a scanner that finds these problems and reports on them,
not to "fix" the app's business logic.

## Commands

- Install: `npm install`
- Run: `npm start`
- Test: `npm test`

## Flag conventions in this repo

- Flags are declared in `flags.config.json` with: `key`, `owner`,
  `createdDate`, `lastModified`, `rolloutPercent`, `status`.
- Code checks flags via `flagClient.isEnabled(key, { fallback })`
  (see `lib/flagClient.js`).
- A flag key referenced in code but missing from `flags.config.json`
  is itself a finding (bypasses governance) — don't treat it as an
  error to fix, treat it as a risk to report.
- A flag key present in `flags.config.json` but never referenced in
  code is also a finding (orphaned/config drift).

## Risk classification (what Flag Guardian should detect)

Report each flag against these rules. A flag can match more than one.

- **Hardcoded / bypasses governance** — a boolean constant or raw
  `process.env` check used as a flag, with no `flags.config.json`
  entry at all.
- **No fallback** — `isEnabled()` called without a `fallback` option.
- **Stale at full rollout** — `rolloutPercent === 100` and
  `lastModified` is more than 90 days old, and the code still
  branches on it.
- **Dead / commented-out** — flag-gated code that is commented out
  rather than deleted.
- **Overdue removal** — a `// TODO: remove by <date>` comment near a
  flag check where `<date>` has already passed.
- **Orphaned in config** — present in `flags.config.json`, zero
  matches for the key anywhere under `routes/`, `services/`,
  `legacy/`, or `lib/`.
- **Healthy** — owned in config, has a fallback, rollout is either
  in-progress or recently touched. No finding.

## Output contract

Write the scan result to `report.json` at the repo root, matching
this shape exactly (the dashboard in `dashboard/` renders this schema):

```json
{
  "generatedAt": "ISO-8601 timestamp",
  "repo": "ledger-web",
  "summary": { "total": 0, "healthy": 0, "atRisk": 0 },
  "flags": [
    {
      "key": "string",
      "owner": "string or null",
      "location": "path/to/file.js or flags.config.json",
      "riskLevel": "healthy | low | medium | high",
      "findings": ["one or more of the rule names above"],
      "recommendation": "one short sentence — what to do about it"
    }
  ]
}
```

## Rules for any code changes

- Never remove a flag or its dead branch without running `npm test`
  first and after, and confirming both pass.
- One PR per flag removal, or one PR grouped by risk tier — state
  which you chose and why.
- Do not change business logic or response shapes for `healthy` flags.
