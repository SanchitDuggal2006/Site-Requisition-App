# Quality and release status

This is an implementation in progress, not yet a production release. Do not distribute a placeholder/debug APK as the completed application.

## Verified locally on 2 November 2026

- TypeScript and Vite production build pass.
- 7 domain tests pass (state graph, PIN/phone rules, date boundaries, quantities, derived item status and overdue).
- 10 embedded PostgreSQL/API tests pass; one concurrency test deliberately runs only on real PostgreSQL.
- All 11 real PostgreSQL tests pass against a separate Neon database named `site_requisitions_test`, including concurrent approval exclusivity. The production schema was initialized separately with no test users/requests.
- High/critical dependency advisories found in the initial PDF/test dependencies were resolved by upgrading. Ten moderate transitive advisories remain in build/file-export dependencies; review before release. No blanket unsafe audit downgrades were applied.

## In progress / not verified

- Mobile Playwright workflow and PDF/Excel downloads: tests implemented, fixing issues found by first run.
- Complete endpoint/role/assignment permission matrix: partial coverage, requires expansion.
- Coverage threshold: configured for domain logic; measurement pending.
- Native Android compilation, signed release verification, emulator/offline/back tests: pending.
- Live Cloudflare runtime and free CPU allowance: pending deployment authorization.
- Physical phones and performance/accessibility audits: pending.
- Initial production director and private temporary PIN: not yet created.

## Loop review

Application source has no timers, intervals, recurring polling, recursive redirects or effects that depend on their own updated data. Refresh happens on navigation, user gesture/button, or returning to the app. Load epochs discard stale responses. Local drafts persist independently of network requests. Native Retry is user initiated. Hardware-back behavior is implemented but must still be tested on Android.

## Known limitations to resolve or explicitly accept

- List endpoints currently cap request/item results; pagination must replace silent truncation before a long-lived deployment.
- Lost/damaged/returned dispatched material and clerical correction flows are not included in this version. Outstanding dispatched quantities remain visible rather than being silently cancelled.
- Generated PDF uses standard Latin fonts; English-only scope applies.
- Automated independent backup scheduling is not configured; manual backup/restore instructions are provided.
- Tests use synthetic credentials only. Production credentials are never committed.
