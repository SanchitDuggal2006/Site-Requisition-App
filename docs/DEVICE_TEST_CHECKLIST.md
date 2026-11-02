# Release gate: device verification

Record APK checksum, signing certificate, version code, APP_URL, model, Android version, WebView version, tester and date. Unchecked items are pending, not passed.

- [ ] Signed release installs on Android 8 / API 26 emulator.
- [ ] Signed release installs on API 34 and current stable Android emulator.
- [ ] Login loads from the deployed HTTPS APP_URL.
- [ ] Forced PIN change works; old PIN fails afterwards.
- [ ] Supervisor submits, manager approves, purchase orders and partially dispatches, supervisor partially receives, then completes.
- [ ] Concurrent approvals: one succeeds and the other sees a conflict.
- [ ] Pull down refresh and resume refresh work without periodic requests.
- [ ] Draft survives app close and network failure; retry does not duplicate submission.
- [ ] Airplane mode before launch shows the native Retry page.
- [ ] Server unreachable / HTTP failure shows Retry; retry after recovery loads login.
- [ ] Back from a nested screen returns; back from root exits without looping.
- [ ] PDF and Excel can be shared, opened and read on the phone.
- [ ] User deactivation invalidates an already-open session.
- [ ] Low-end physical phone: layout, tap targets, keyboard, slow connection.
- [ ] Recent physical phone: safe areas, navigation bar, keyboard, sharing.
- [ ] Install a higher-version signed update over the prior APK without losing the session/draft.

Do not distribute as production-ready until all required checks are recorded.
