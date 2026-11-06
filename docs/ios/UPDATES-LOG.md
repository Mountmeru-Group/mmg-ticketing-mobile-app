# EAS Update log (iOS)

> Every update published to an iOS channel, newest last. The rules are in `RELEASE-IOS.md` §6; rule 5 asks for this log.
> Created in iOS-5f (2026-11-06). Entry 1 was published before this file existed and is recorded from Ronit's brief.

**Before every update** (`RELEASE-IOS.md` §6): run §2 in full, then in the same PowerShell window:
```
$env:EXPO_PUBLIC_APP_ENV="UAT"
npx eas-cli@24.8.0 update --channel ios-preview --platform ios --message "fix: <what and why>"
```

| # | Date | Update group | Channel | Platform | Runtime | From commit | What | Why it may ship by update | Who gets it |
|---|---|---|---|---|---|---|---|---|---|
| 1 | After 2026-11-03 12:48 +0530 (the commit's time); the publish date is not in the brief, Ronit to add it | `85d04f32-b8db-495a-a6fa-26f0a04409cb` | `ios-preview` | ios | `0.1.0` | `6897b70` | **iOS-8a** (`96633b7`: solid Android-style headers, no overlap, safe-area and tab-bar insets) and **iOS-5e** (`33dc1f6`: Home periods and the web's KPIs, the period chip, Approvals for every role, the ADMIN-only audit log) | iOS-8a: a fix (rule 1). iOS-5e: **the one-time Q7 exception** to compliance C2's "fixes only" (rule 9; `ANDROID-DELTA.md` §9.2) | **Internal TestFlight testers only**, on build 0.1.0 (1). No external group while it is on the channel (rule 9) |

## Notes

- **Builds and runtime.** `runtimeVersion` follows `appVersion` (`app.json`), so every 0.1.0 build takes the updates above.
- **iOS-5f is not an update.** Ronit's decision 2 (2026-11-06; `ANDROID-DELTA.md` §10) sends iOS-5f to testers in **TestFlight build 0.1.0 (2)**. Build 2 starts on its own, newer, embedded code.
- **⚠ Before entry 2:** builds 1 and 2 share runtime 0.1.0. An update published after build 2 reaches build 1 too, and one built from iOS-5f code would bring iOS-5f's features to build 1 by update. Ronit decides first: build 1 expired for every tester, or a new version (a new runtime). `RELEASE-IOS.md` §6, rule 10.
