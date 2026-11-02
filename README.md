# Site Requisitions

Android-first material requisitions for an interior fit-out business. Shared Cloudflare API + Neon PostgreSQL, with a React phone interface and Capacitor APK. Includes directors, site-scoped managers/supervisors, purchase, approval history, partial dispatch/receipt, and PDF/XLSX reports.

## Local setup

Node 22 or newer. Run `npm ci`, copy `.env.example` to `.env`, set DATABASE_URL, then `npm run db:migrate`. Set ADMIN_NAME, ADMIN_PHONE and ADMIN_PIN privately and run `node --env-file=.env --import tsx scripts/bootstrap.ts` once. Bootstrap refuses if an active director already exists. Never commit `.env` or credentials.

For the Worker locally, copy DATABASE_URL and BUSINESS_TZ into `.dev.vars`, run `npm run build` then `npm run preview`. For UI development, run `npm run dev` alongside the Worker on port 8787. To view a disposable sample workspace without Neon, run `npm run build` then `npx tsx scripts/test-server.ts` and open http://127.0.0.1:4173. Sample credentials are confined to that test server (numbers 9000000000 through 9000000003, PIN 681429); they are never seeded in production.

## Validation

`npm run build` checks TypeScript and creates assets. `npm test` runs domain and embedded database/API tests. `TEST_DATABASE_URL=postgres://.../site_requisitions_test npm test` runs real PostgreSQL tests, including concurrency. **Tests reset the public schema only in a database whose name ends in `_test`; never point them at production.** `npx playwright install chromium` then `npm run test:e2e` exercises the mobile interface against an isolated sample database. CI uses a disposable PostgreSQL service.

## Deployment

Authenticate with Cloudflare Wrangler. Store DATABASE_URL with `npx wrangler secret put DATABASE_URL` and deploy with `npm run deploy`. BUSINESS_TZ defaults to Asia/Kolkata. Set the final HTTPS URL as APP_URL for Android. The browser and APK use same-origin secure HTTP-only cookies; no public database keys are shipped to clients. Review `docs/DECISIONS.md` for choices and deviations, and `docs/QUALITY.md` for unfinished release gates.

## Backups

Use PostgreSQL `pg_dump --format=custom --file=backup.dump "$DATABASE_URL"` on a trusted machine. Encrypt backups before storing them outside the database (for example in a private Drive folder). Keep daily/weekly retention appropriate to the business. Test recovery using `pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" backup.dump` into a separate empty database, then check users, sites, request counts, quantities and audit events. Do not restore over production without a reviewed recovery plan. Neon free history is not a substitute for independent backups. Automated Drive backup integration is not configured yet.

## Android and operations

See `docs/ANDROID.md` for build/signing, `docs/DEVICE_TEST_CHECKLIST.md` for release validation, and `docs/ADMIN_GUIDE.md` for team onboarding and handover.
