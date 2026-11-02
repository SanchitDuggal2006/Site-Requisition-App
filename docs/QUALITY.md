# Quality and release status

## Verified on 2 November 2026

- TypeScript and Vite production build pass.
- Seven domain tests pass; domain coverage is 100% lines/statements/functions and 95.65% branches.
- All 14 database/API tests pass against the separate Neon site_requisitions_test database, including concurrency, role/site permissions and director handover. Remote runs allow 30 seconds per test for network round trips.
- Four mobile-browser workflow tests pass: request/approval/partial dispatch/partial receipt/completion; rejection/copy/cancellation; site/user administration; forced PIN changes. PDF and Excel download checks pass.
- Automated WCAG A/AA checks on login, director dashboard and report pass. These do not replace manual accessibility testing.
- Cloudflare deployment, restricted database role, live health/login/session/logout and the initial director's mandatory PIN-change restriction were checked. Production contains no sample requests or users.
- A signed release APK compiled and passed signature verification. Android 14 emulator checks passed for live login, root Back and offline Retry.
- The old Android 8 image showed a blank page with its obsolete WebView. A native update message now requires WebView 108 or newer. Rebuilt APK verification is recorded in the Android device workflow; Android 8 business workflows with an updated WebView still require a physical-device check.
- No high/critical npm advisories at dependency review; ten moderate transitive advisories remain. Build/file-export dependencies need ongoing maintenance.

## Physical-device acceptance still required

Install the signed APK on the owner's phone before general rollout. Check first PIN change, a sample request through delivery, PDF/Excel sharing to another app, nested Back, keyboard and pull-to-refresh. Check the team's oldest phone with its updated WebView. See DEVICE_TEST_CHECKLIST.md. This release is ready for that pilot, not a claim that all physical-device checks have been completed.

## Refresh and data integrity

Application source has no recurring polling. Refresh happens on navigation, user gesture/button or returning to the app. Load epochs discard stale responses. Local drafts survive refresh. Native Retry is user initiated. Submission keys prevent duplicate requests; row locks and version checks protect approval and quantity updates. List endpoints do not silently truncate records.

## Operational limitations

- Internet is required for shared data and initial app loading; this is not a fully offline application.
- Lost/damaged/returned dispatched material and clerical correction flows are not included. Outstanding dispatched quantities remain visible.
- English-only PDF fonts. No photos, attachments, WhatsApp automation or price accounting.
- Independent scheduled backups are not configured; README includes manual backup and restore instructions. Google Drive can hold exported reports or encrypted backups manually.
- Free cloud quotas can change; check provider dashboards before increasing usage. Large datasets will need server-side pagination.
- Production credentials and signing material are excluded from the public repository. Keep the private signing backup to preserve APK update compatibility.
