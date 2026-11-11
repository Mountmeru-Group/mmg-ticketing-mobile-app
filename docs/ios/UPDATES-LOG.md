# EAS Update log (iOS)

> Every update published to an iOS channel, newest last. The rules are in `RELEASE-IOS.md` §6; rule 5 asks for this log.
> Created in iOS-5f (2026-11-06). Entry 1 was published before this file existed and is recorded from Ronit's brief.

**Before every update** (`RELEASE-IOS.md` §6): run §2 in full, then in the same PowerShell window:
```
$env:EXPO_PUBLIC_APP_ENV="UAT"
npx eas-cli@24.8.0 update --channel ios-preview --platform ios --clear-cache --message "fix: <what and why>"
```
`--clear-cache` is required since iOS-9b: the local Metro cache is not keyed on `EXPO_PUBLIC_APP_ENV`, so without it an update can carry the other environment's API URL (`RELEASE-IOS.md` §6 rule 4).

**`production` (the App Store build, iOS-9b): no update yet.** The first one waits for an agreed procedure (`RELEASE-IOS.md` §6 rule 6). It will need `$env:EXPO_PUBLIC_APP_ENV="PROD"` in the same window and `--channel production --platform ios --clear-cache`, and `verify-release-bundle -- --profile production` must PASS first: otherwise the update carries the UAT URL to App Store users.

| # | Date | Update group | Channel | Platform | Runtime | From commit | What | Why it may ship by update | Who gets it |
|---|---|---|---|---|---|---|---|---|---|
| 1 | After 2026-11-03 | `85d04f32-b8db-495a-a6fa-26f0a04409cb` | `ios-preview` | ios | `0.1.0` | `6897b70` | **iOS-8a** (`96633b7`: solid Android-style headers, no overlap, safe-area and tab-bar insets) and **iOS-5e** (`33dc1f6`: Home periods and the web's KPIs, the period chip, Approvals for every role, the ADMIN-only audit log) | iOS-8a: a fix (rule 1). iOS-5e: **the one-time Q7 exception** to compliance C2's "fixes only" (rule 9; `ANDROID-DELTA.md` §9.2) | **Internal TestFlight testers only**, on build 0.1.0 (1). No external group while it is on the channel (rule 9) |

## Notes

- **Builds and runtime.** `runtimeVersion` follows `appVersion` (`app.json`): build 0.1.0 (1) is runtime **0.1.0**, and takes entry 1 only.
- **iOS-5f is not an update.** Ronit's decision 2 (2026-11-06; `ANDROID-DELTA.md` §10) sends iOS-5f to testers in **TestFlight build 0.2.0 (2)**: `app.json` `version` 0.1.0 → 0.2.0 (Ronit, 2026-11-06), so its runtime is **0.2.0**.
  - An update for build 2 is published for runtime 0.2.0 and cannot reach build 1; entry 1 cannot reach build 2.
  - **Build 1 is retired once 0.2.0 is on TestFlight** (expired in App Store Connect). Nothing more is published for runtime 0.1.0. `RELEASE-IOS.md` §6, rule 10.
- **iOS-5g is not an update either.** G9, the email sign-in (UAT builds only then), is in the same build **0.2.0 (2)** as iOS-5f (Ronit, iOS-5g; `ANDROID-DELTA.md` §10.8). Since R1 that build no longer waits for the backend team's `Set-Cookie` answer (`RELEASE-IOS.md` §6, rule 10). A later G9 change goes by update only if it is a fix (rule 1).
- **iOS-9b (2026-11-11): runtime 1.0.0 and the `production` channel** (`RELEASE-IOS.md` §6 rule 11).
  - `app.json` `version` is **1.0.0**, so every build from iOS-9b on, TestFlight (`preview`) and App Store (`production`) alike, is runtime **1.0.0**. From then on the **channel** separates them: `ios-preview` and `production`, written into each binary by EAS.
  - An `ios-preview` update can never reach a production build, and the reverse, as long as the channels are never linked (no `eas channel:edit` or `eas channel:rollout` between them).
  - **Build 0.2.0 (2) stays runtime 0.2.0.** A fix for it is published from a commit **before iOS-9b** (`bafbb8c` or earlier, where `app.json` says 0.2.0). Published from iOS-9b on, it would be runtime 1.0.0 and would never reach build 2.
  - No update was published in iOS-9b.
- **The next entry** names its channel and its runtime (0.2.0 for build 2; 1.0.0 for builds from iOS-9b) and follows rule 1 (fixes only).
