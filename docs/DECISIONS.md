# Implementation decisions

## Current scope

Android app for one company; English, light theme, mobile number + PIN, 5–6 initial users and 4–5 sites. Multiple directors have full control. Managers approve assigned sites. Supervisors submit and confirm receipts for assigned sites. Purchase works across sites. Directors can perform all these actions. The last active director cannot be removed. Users/sites are deactivated, never deleted through the app.

Approval is on the whole request. Rejected/cancelled requests are terminal and can be copied into a new request. Purchase records ordering and partial dispatches. Supervisors confirm partial receipts. A director can act on either side; purchase cannot confirm its own receipts. Cancellation applies only to undispatched quantities, with a reason. Goods already dispatched remain outstanding until receipt is recorded; loss/return/correction workflows are not yet included. This avoids silently treating dispatched goods as cancelled deliveries.

## Architecture changes from the original meta-prompt

React + Vite static assets and a Hono Cloudflare Worker replace Next.js/Tailwind. Neon PostgreSQL and parameterized SQL/functions replace Prisma. The user prioritized free operation and authorized technology choices. This reduces worker work, permits client-side PDF/Excel generation, and keeps transactional invariants in PostgreSQL. All database access is server-side, never from the browser.

PIN hashes use pgcrypto bcrypt at cost 12 in PostgreSQL. This intentionally moves password hashing away from the free Worker's CPU budget. Login limits are stored in PostgreSQL, not process memory. PINs travel only through HTTPS and the encrypted database connection, are parameterized, and are not logged by application code. Production DB query parameter logging must remain disabled.

The Android Capacitor WebView loads the deployed HTTPS origin. No iOS/PWA support is included following the user's Android-only instruction. Static app assets are not cached by a service worker. A native offline overlay handles failed top-level loads; in-app network errors retain the current draft. Reports are generated on the phone and may be saved/shared; they are not uploaded to a separate file store.

## Correctness and concurrency

Every workflow mutation executes in one SQL function/transaction. Row locks serialize competing actions; item versions reject stale updates. Submission keys prevent duplicate requests after retries. Audit events are inserted in the same transaction. Stored quantity checks guarantee received <= dispatched and dispatched + cancelled <= requested. Decimal precision is three places. Completion is derived. Site scope is checked on every API read and business mutation.

Report date uses Asia/Kolkata by default. Raised is a distinct-request count, approvals/rejections count request events, ordered/delivered count item transitions, and dispatches/receipts count events (not units). Open/overdue is explicitly the current state, even when viewing an earlier date. All event timestamps are UTC and rendered in the business timezone.

## Libraries and reasons

- React/react-dom: mobile interface and form state.
- Vite and its React plugin: static asset build/local development.
- Hono: small Worker router and cookie helpers.
- Zod: request validation shared with domain tests.
- Neon serverless: HTTPS parameterized PostgreSQL queries in Workers.
- pg: migrations, bootstrap and real PostgreSQL tests in Node.
- Capacitor core/Android/CLI: installable WebView wrapper; App: back button; Filesystem + Share: report sharing through Android.
- jsPDF: locally generated, paginated PDF reports; ExcelJS: genuine XLSX workbooks with separate report sheets.
- TypeScript/type definitions: static checks.
- Vitest/coverage: domain/API/database tests. PGlite/pgcrypto: isolated PostgreSQL-compatible local tests; it does not replace real PostgreSQL concurrency tests.
- Playwright: complete mobile browser workflow and download testing.
- Wrangler: local Worker runtime and deployment. tsx: TypeScript setup/test scripts.

## Limits and remaining release gates

See QUALITY.md for tests actually run. Do not describe generated native source or a CI definition as a tested signed APK. Real-device checks and live Cloudflare verification must precede operational handover. Free tiers have quotas and are not a reliability SLA.
