# 18 — Analytics Dashboard: Backend Specification

**For:** MMG Service Desk backend team
**From:** Ronit Chaudhari — Setu mobile app
**Date:** 19 November 2026
**Scope:** All fifteen metrics, for an ADMIN-only Analytics screen in Setu

---

## 1. What we are asking for

An Analytics screen in the Setu mobile app, below Audit log, ADMIN only. It needs fifteen metrics, and they come from two different places.

**Four endpoints:**

```
GET /api/v1/analytics/overview      headline numbers, from our database
GET /api/v1/analytics/users         a row per person
GET /api/v1/analytics/users/:id     one person's activity
GET /api/v1/analytics/installs      Play Console figures, via a daily job
```

The first three read data you already hold. The fourth needs a new integration with Google, described in §6. **All four are wanted.**

**All aggregation happens on your side.** The phone must never receive raw rows to count — the audit log is tens of thousands of records. Send counts.

---

## 2. Where each of the fifteen comes from

| # | Metric | Source | Endpoint |
|---|---|---|---|
| 1 | User acquisitions | Play Console | `/installs` |
| 2 | Active devices | Play, and our device tokens | both |
| 3 | Daily active users | Our database | `/overview` |
| 4 | Total installs | Play Console | `/installs` |
| 5 | User loss (uninstalls) | Play Console | `/installs` |
| 6 | Audience growth rate | Play Console | `/installs` |
| 7 | Total audience size | Play Console | `/installs` |
| 8 | Monthly active users | Our database | `/overview` |
| 9 | Crash rate | Play Console | `/installs` |
| 10 | Logins to the Setu app | Our database — **see §3a** | `/overview` |
| 11 | Current installs | Play, and our device tokens | both |
| 12 | Installs per country | Play, and our device tokens | both |
| 13 | Usage per person | Our database — **see §3e** | `/users` |
| 14 | Actions per user, with timestamps | Our database (audit log) | `/users`, `/users/:id` |
| 15 | Last usage and last action per person | Our database (audit log) | `/users` |

Six come from your own data. Seven come from Google. Three (2, 11, 12) can come from either, and having both is useful: Play counts every device with the app, our device tokens count every device that has signed in and enabled notifications.

---

## 3. Five questions, please answer before building

These decide what is possible. Answer in this file and send it back.

### 3a. Do sessions record whether a login came from mobile or web?

Metric 10 is **logins to the Setu app**, not to the web portal. Does the session or login record a platform, a user agent, or anything that distinguishes them?

If not, please add a `platform` column, set from the route used:

- `/auth/mobile/login` and `/auth/microsoft/mobile` → `mobile`
- the web's own login → `web`

That one column is the whole of metric 10.

**ANSWER:**
<!-- Yes, it records X / No, we will add it -->

### 3b. What columns does the device-token table have?

Each registered FCM token is one phone with Setu installed and signed in. We need `userId`, `createdAt`, and ideally `lastSeenAt`, refreshed when the token is re-registered.

**ANSWER:**
<!-- The columns it has -->

### 3c. Does the audit log record sign-ins?

It records ticket actions well. Does it record a login? If not, that is the one event worth adding — it is the basis of metrics 3, 8 and 10.

**ANSWER:**
<!-- Yes / No -->

### 3d. How far back should we aggregate?

The audit log is large. We suggest a 90-day cap on live queries, with pre-aggregated daily counts for anything older.

**ANSWER:**
<!-- Your call -->

### 3e. Metric 13: what can you give us?

"Usage per person" normally means time spent in the app. **We cannot measure that.** Setu has no analytics SDK, and our Play Data safety declaration states we collect no app activity. Adding one means changing that declaration and a new Play review.

What you *can* give us per person, from existing data: logins, actions, days active, first and last seen in the period. A good proxy, and it needs nothing new in the app.

**ANSWER:**
<!-- Is the proxy acceptable, or does Ronit want the SDK route? -->

---

## 4. The three database endpoints

All require **ADMIN**, enforced server-side. Do not rely on the app to hide the screen.

### 4a. `GET /api/v1/analytics/overview`

**Query:** `range` — `today | last7 | last30 | last90`, matching the dashboard's existing ranges. Optional `countryId`.

```json
{
  "range": "last30",
  "from": "2026-10-20T00:00:00.000Z",
  "to": "2026-11-19T23:59:59.999Z",
  "users": {
    "activeToday": 48,
    "activeThisMonth": 212,
    "totalWithAccess": 1631,
    "newThisPeriod": 34
  },
  "devices": {
    "registered": 187,
    "activeThisMonth": 160,
    "byCountry": [
      { "countryId": "...", "country": "Tanzania", "devices": 74 },
      { "countryId": "...", "country": "Zambia",   "devices": 52 }
    ]
  },
  "logins": { "mobile": 1420, "web": 3890 },
  "actions": {
    "total": 8740,
    "byType": [
      { "action": "COMMENTED", "count": 3120 },
      { "action": "STATUS_CHANGED", "count": 2240 }
    ]
  }
}
```

Covers metrics 3, 8, 10, and the device-token side of 2, 11 and 12.

Every field is optional from our side — the app renders what arrives and skips what doesn't. Send what you can and tell us what you left out.

### 4b. `GET /api/v1/analytics/users`

**Query:** `range`, `page`, `limit` (cap 100), `sortBy` (`lastSeen` | `actions` | `name`), `countryId`.

```json
{
  "page": 1,
  "limit": 50,
  "total": 212,
  "rows": [
    {
      "userId": "...",
      "name": "Grace Banda",
      "email": "grace.banda@mountmerugroup.com",
      "role": "AGENT",
      "country": "Zambia",
      "lastSeenAt": "2026-11-19T09:42:00.000Z",
      "lastAction": {
        "type": "STATUS_CHANGED",
        "ticketNumber": 10482,
        "at": "2026-11-19T09:42:00.000Z"
      },
      "actionsInPeriod": 184,
      "loginsInPeriod": 22,
      "daysActiveInPeriod": 17,
      "hasMobileApp": true
    }
  ]
}
```

Covers metrics 13 (as the proxy), 14 and 15.

`lastAction` is the one field we cannot assemble without pulling the whole audit log. Please include it.

### 4c. `GET /api/v1/analytics/users/:id`

**Query:** `range`, `page`, `limit`.

One person's recent activity, newest first — the audit log filtered to that user. If reusing the audit log's existing response shape is easier, do that and tell us; we already read it.

Covers metric 14 in detail.

---

## 5. Things that will bite

**Aggregate on the server.** Never send rows for the phone to count.

**Cache it.** Five or ten minutes is fine — nobody needs analytics to the second. The app will not poll.

**UAT and Production share hardware.** A heavy unindexed query here slows the ticket list for everyone. Please check indexes on whatever you group by.

**Pagination is required.** 1,631 users will not fit in one response.

---

## 6. The Play Console integration

This covers the seven metrics only Google holds: 1, 4, 5, 6, 7, 9, plus the Play side of 2, 11 and 12.

### 6a. What Google provides

The **Play Developer Reporting API** serves install, uninstall, active-device and crash figures for our app. It is free; no billing is involved.

Docs: `developers.google.com/play/developer/reporting`

Our app: `com.mountmeru.servicedesk`

### 6b. Setup, one time

1. **Create a Google Cloud project** (free). Enable the **Play Developer Reporting API** on it.
2. **Create a service account** in that project and download its JSON key.
3. **Send Ronit the service account's email address.** He will grant it read access in Play Console under Users and permissions. The API returns nothing until that is done.
4. **Store the JSON key as an environment variable**, as with `FIREBASE_SERVICE_ACCOUNT_JSON`. Never commit it.

### 6c. The daily job

Google's figures are daily and settle a day or two late. So:

- Run once a day, early morning
- Fetch the last 7 days each run and upsert, so late corrections are picked up
- Store in a table keyed by date, and by country where Google breaks it down
- Log failures; do not let a failed run break the endpoint

Suggested table:

```
analytics_play_daily
  date            date       primary key with country
  country         text       null = all countries
  installs        int        new installs that day
  uninstalls      int
  activeDevices   int
  totalInstalls   int        cumulative, if Google gives it
  crashRate       float      Google's own measure
  fetchedAt       timestamp
```

### 6d. `GET /api/v1/analytics/installs`

**Query:** `range` — the same four values. Optional `countryId`.

```json
{
  "range": "last30",
  "from": "2026-10-20",
  "to": "2026-11-19",
  "dataThrough": "2026-11-17",
  "totals": {
    "installs": 142,
    "uninstalls": 18,
    "netGrowth": 124,
    "growthRatePercent": 8.4,
    "currentInstalls": 1598,
    "activeDevices": 1204,
    "audienceSize": 1598
  },
  "crashRatePercent": 0.42,
  "byCountry": [
    { "country": "Tanzania", "installs": 61, "uninstalls": 7, "currentInstalls": 640 },
    { "country": "Zambia",   "installs": 44, "uninstalls": 5, "currentInstalls": 512 }
  ],
  "daily": [
    { "date": "2026-11-17", "installs": 6, "uninstalls": 1, "activeDevices": 1204 }
  ]
}
```

**`dataThrough` matters.** Google's figures lag a day or two. The app will show "as at &lt;date&gt;" so nobody thinks today's number is missing or wrong.

Mapping back to the list:

| # | Metric | Field |
|---|---|---|
| 1 | User acquisitions | `totals.installs` |
| 2 | Active devices | `totals.activeDevices` |
| 4 | Total installs | `totals.currentInstalls` |
| 5 | User loss | `totals.uninstalls` |
| 6 | Audience growth rate | `totals.growthRatePercent` |
| 7 | Total audience size | `totals.audienceSize` |
| 9 | Crash rate | `crashRatePercent` |
| 11 | Current installs | `totals.currentInstalls` |
| 12 | Per-country installs | `byCountry` |

If Google does not expose one of these, send what it does and tell us which is missing. We will leave that tile out rather than show a wrong number.

### 6e. A note, in fairness

Play Console already shows all of §6 in a dashboard built for it, free, updated daily, with better breakdowns than we will rebuild.

Ronit has decided he wants it inside the app, which is a legitimate call — one place to look, sitting beside the data Play cannot see. But if the effort turns out larger than expected, adding leadership as Play Console users is a free alternative worth raising rather than quietly cutting scope.

---

## 7. One thing to flag

Sections 4b and 4c show **what each named employee did and when**.

That is employee monitoring, however reasonable the intent. In some countries MMG operates in, it needs disclosure to staff or a stated retention period. Worth a word with whoever owns HR policy before it ships — raised now rather than after.

---

## 8. Summary

| # | What | Priority |
|---|---|---|
| 1 | Answer the five questions in §3 | First |
| 2 | `GET /analytics/overview` | High |
| 3 | `GET /analytics/users` | High |
| 4 | `GET /analytics/users/:id` | Medium |
| 5 | ADMIN enforced server-side on all four | High |
| 6 | Cloud project, service account, send Ronit the email | Then |
| 7 | Daily job and the `analytics_play_daily` table | Then |
| 8 | `GET /analytics/installs` | Then |

**Nothing is blocked on us.** Send the shapes even before they are live and we will build against them. The app side is one screen.

---

**Ronit Chaudhari**
ronit.chaudhari@mountmerugroup.com
