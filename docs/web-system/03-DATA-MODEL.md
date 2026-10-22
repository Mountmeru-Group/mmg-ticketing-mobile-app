# 03 — Data Model (mobile-relevant subset)

**Source:** `backend/prisma/schema.prisma` (1,762 lines, read as text) plus the Prisma `include`/`select` in each controller. Line numbers are as of 2026-10-09.

> **Read this first**
> 1. **The API shape is narrower than the database shape.** §C's interfaces describe **API responses**: each relation is typed exactly as the controller's `select` returns it. Different endpoints return different subsets of the same model, e.g. `User` has five shapes. Use the right interface per endpoint.
> 2. **JSON conventions:**
>    - nullable columns arrive as `null`, never omitted;
>    - `DateTime` becomes an ISO-8601 UTC **string**;
>    - `Json` columns arrive as parsed JSON;
>    - `Int` is a number;
>    - `String[]` is `string[]`.
> 3. **"Priority" and "Status" are enums, not tables.** There is no Priority or Status model and no endpoint for them. Their values are fixed below. `PriorityMatrix` is the only related table.
> 4. **Schema drift (VERIFY, `00-OVERVIEW.md` B2):**
>    - The database is managed by `prisma db push`, and the migrations don't match.
>    - `users.mustChangePassword` exists only through raw SQL; it is **not** in `schema.prisma` and is **never** returned.
>    - `tickets.lastRequesterReplyAt` and `comments.toRecipients/ccRecipients` are in the schema, but the code reads them through raw SQL "because they may not exist on all deployments".
>    - So treat them as optional.

---

## A. Enums (exact string values)

| Enum | Values (in schema order) | Source |
|---|---|---|
| `UserRole` | `ADMIN`, `AGENT`, `END_USER`, `L2_MANAGER` | `schema.prisma:14-19` |
| `TicketStatus` | `OPEN`, `IN_PROGRESS`, `PENDING`, `PENDING_USER_INFO`, `PENDING_USER_CONFIRM`, `PENDING_PARTNER`, `PENDING_MASTER_DATA`, `PENDING_MGMT_REVIEW`, `ON_HOLD`, `RESOLVED`, `CLOSED`, `CANCELED` | `:21-34` |
| `TicketPriority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | `:36-41` |
| `TicketSource` | `WEB_FORM`, `EMAIL`, `PORTAL`, `API` (no `MOBILE`; ask A15) | `:43-48` |
| `SLAStatus` | `WITHIN_SLA`, `DUE_SOON`, `BREACHED` | `:50-54` |
| `NotificationType` | `TICKET_ASSIGNED`, `TICKET_UPDATED`, `TICKET_RESOLVED`, `SLA_WARNING`, `SLA_BREACHED`, `COMMENT_ADDED`, `MENTION` (never produced) | `:56-64` |
| `CommentType` | `PUBLIC`, `PRIVATE` | `:66-69` |
| `AuditAction` | `CREATED`, `UPDATED`, `DELETED`, `STATUS_CHANGED`, `ASSIGNED`, `COMMENTED`, `ATTACHMENT_ADDED`, `SLA_BREACHED`, `ESCALATED` | `:71-81` |
| `TicketImpact` | `MINIMAL`, `LOW`, `MEDIUM`, `HIGH` (UI: Affects User / Group / Department / Business) | `:83-88` |
| `TicketUrgency` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | `:90-95` |
| `TaskStatus` | `OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` (**two Ls**, unlike TicketStatus `CANCELED`) | `:97-102` |
| `ApprovalStatus` | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` | `:756-761` |
| `AnnouncementType` | `INFO`, `WARNING`, `CRITICAL`, `MAINTENANCE` | `:1003-1008` |

**String fields with a fixed value set** (not DB enums, so the server doesn't validate them)

| Field | Values | Defined in |
|---|---|---|
| `Category.level` | `CATEGORY`, `SUBCATEGORY`, `ITEM` (default `CATEGORY`) | `schema.prisma:255` |
| `Ticket.closureCode` | `Resolved – Issue Fixed`, `Resolved – Workaround Provided`, `Closed – Duplicate`, `Closed – Won't Fix`, `Cannot Reproduce`, `Other` (U+2013 dashes) | `FE:pages/tickets/TicketDetailPage.tsx:2456-2462` |
| `Ticket.level` | `LEVEL_1`, `LEVEL_2`, `LEVEL_3` | `FE:pages/tickets/CreateTicketPage.tsx:481-486` |
| `Ticket.mode` | `PHONE`, `EMAIL`, `WALK_IN`, `SELF_SERVICE`, `CHAT` | `FE:CreateTicketPage.tsx:390-397` |
| `Approval.entityType` | `ticket`, `change`, `service_request` | `schema.prisma:765`, `modules/approvals/approvals.controller.ts` |
| `Announcement.targetRoles[]` | `UserRole` values (empty = everyone) | `modules/announcements/announcements.controller.ts:47-50` |

**Status groupings the backend uses**
- **Hold statuses** (SLA clock paused): `ON_HOLD`, `PENDING`, `PENDING_MGMT_REVIEW`, `PENDING_MASTER_DATA`, `PENDING_PARTNER`, `PENDING_USER_CONFIRM`, `PENDING_USER_INFO` (`modules/tickets/tickets.controller.ts:861`).
- **Dashboard "active":** `OPEN`, `IN_PROGRESS`, `ON_HOLD`, `PENDING` (`modules/dashboard/dashboard.controller.ts:61-66`).
- **Terminal in the web UI:** `CLOSED`, `CANCELED` (no transitions). `RESOLVED` auto-closes after 48 h.

---

## B. Models

Columns: **Field | Type | Null | Default | Notes**. "API" notes say where the field is exposed.

### B.1 Ticket — `schema.prisma:340-409` (table `tickets`)
| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | String (uuid) | no | `uuid()` | Used in every URL |
| ticketNumber | Int | no | autoincrement | Unique; human ID `#1234`; no endpoint accepts it as a path parameter |
| title | String | no | – | 3–255 (zod) |
| description | String | no | – | **HTML**; may contain base64 images |
| status | TicketStatus | no | `OPEN` | |
| priority | TicketPriority | no | `MEDIUM` | Recomputed from PriorityMatrix when impact and urgency are both set |
| impact | TicketImpact | yes | – | Cannot be cleared back to null via the API |
| urgency | TicketUrgency | yes | – | Same |
| source | TicketSource | no | `WEB_FORM` | |
| requesterId | String | no | – | FK User |
| assignedToId | String | yes | – | FK User |
| teamId | String | yes | – | FK Team ("Group" in the UI) |
| categoryId | String | yes | – | FK Category (any level) |
| countryId | String | yes | – | FK Country (SetNull); copied from the requester on create |
| tags | String[] | no | `[]` | |
| slaPolicyId | String | yes | – | FK SLAPolicy |
| slaStatus | SLAStatus | no | `WITHIN_SLA` | Maintained by a job every 60 s |
| firstResponseAt | DateTime | yes | – | First public non-requester reply, or the first (re)assignment |
| resolvedAt | DateTime | yes | – | Set once; not cleared on reopen |
| closedAt | DateTime | yes | – | Set once; not cleared on reopen |
| slaResponseDue | DateTime | yes | – | Business-hours deadline |
| slaResolveDue | DateTime | yes | – | Extended by hold time on hold exit |
| slaBreachedAt | DateTime | yes | – | |
| slaBreachNotifiedAt | DateTime | yes | – | |
| slaHoldStartedAt | DateTime | yes | – | Set while in a hold status |
| slaHoldMinutes | Int | no | `0` | Accumulated hold minutes |
| lastRequesterReplyAt | DateTime | yes | – | "Unread reply" marker; guaranteed only on the list (raw SQL) |
| emailMessageId | String | yes | – | Unique; internal |
| emailThreadId | String | yes | – | Internal |
| level | String | yes | – | Not saved on create |
| mode | String | yes | – | Not saved on create |
| resolution | String | yes | – | Closure modal |
| closureCode | String | yes | – | Free text (list in §A) |
| isFcr | Boolean | **yes** | `false` | |
| closureComments | String | yes | – | Also posted as a PUBLIC comment |
| customFields | Json | yes | `{}` | Not rendered anywhere |
| createdAt / updatedAt | DateTime | no | `now()` / auto | |

**Relations and where the API includes them**

| Relation | Included by | Shape |
|---|---|---|
| requester (User) | TKT-1..6 (`TICKET_INCLUDE`) | `{id, displayName, email, avatarUrl, phone, department, timezone, role, countryId}` |
| assignedTo (User?) | TKT-1..6 | `{id, displayName, email, avatarUrl}` |
| team (Team?) | TKT-1..6 | `{id, name}` |
| country (Country?) | TKT-1..6 | `{id, name, displayName}` |
| category (Category?) | TKT-1..6 | `{id, name, level, parentId, parent:{id,name,level,parentId, parent:{id,name,level}}}` |
| slaPolicy (SLAPolicy?) | TKT-1,2,4,5,6: `{id,name}`; **TKT-3: full row** | |
| tasks (TicketTask[]) | TKT-1..6 | task scalars + `assignedTo:{id,displayName,email}` (no avatarUrl), sortOrder asc |
| comments, attachments | only as `_count:{comments, attachments}` on TKT-1..6; full rows via CMT-1, ATT-1, TKT-7 | |
| auditLogs | TKT-7 (activity) | see `ActivityAuditItem` |
| notifications, emailMessages, problemLinks, changeLinks, assetLinks, surveyResponses | **never included** | |

### B.2 User — `schema.prisma:108-177` (table `users`)
| Field | Type | Null | Default | Exposed to mobile? |
|---|---|---|---|---|
| id | String (uuid) | no | `uuid()` | yes |
| email | String | no | – | yes (unique) |
| displayName | String | no | – | yes |
| ldapDn | String | yes | – | no |
| ldapSamAccount | String | yes | – | AUTH-2 only |
| azureAdId | String | yes | – | no |
| passwordHash | String | yes | – | **never** (⚠ leaked by an admin endpoint, `05` §C.8) |
| avatarUrl | String | yes | – | in some selects; **nothing writes it** |
| role | UserRole | no | `END_USER` | yes |
| isActive | Boolean | no | `true` | USR-1 |
| department | String | yes | – | free text (AD sync) |
| officeLocation | String | yes | – | no |
| phone | String | yes | – | yes |
| timezone | String | no | `"UTC"` | USR-1/USR-2 |
| siteId / departmentId | String | yes | – | no |
| countryId | String | yes | – | AUTH-2, `requester.countryId` |
| lastLoginAt | DateTime | yes | – | USR-1 |
| createdAt / updatedAt | DateTime | no | | USR-1 (createdAt) |
| *(mustChangePassword)* | *(Boolean, raw SQL only)* | | | **not in the schema; never returned** |

**User shapes by endpoint:** `AuthUser` (AUTH-2), `UserProfile` (USR-1), `UserProfileUpdated` (USR-2), `UserSearchResult` (USR-3), `TicketRequester` / `UserRef` (in tickets).

### B.3 Comment — `schema.prisma:415-433` (table `comments`)
| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | String | no | uuid | |
| ticketId | String | no | – | Cascade on ticket delete |
| authorId | String | no | – | FK User |
| body | String | no | – | **HTML**, stored unsanitised |
| type | CommentType | no | `PUBLIC` | |
| isEdited | Boolean | no | `false` | |
| toRecipients | String[] | no | `[]` | Read and written via raw SQL; `[]` if the column is missing |
| ccRecipients | String[] | no | `[]` | Same |
| createdAt / updatedAt | DateTime | no | | |

**Relations in the API**
- `author`: `{id,displayName,email,avatarUrl}` in CMT-1, CMT-2 and TKT-7; `{id,displayName,email}` in CMT-3.
- `attachments`: full rows in CMT-1; `{id,fileName,mimeType,storagePath}` in TKT-7; absent in CMT-2 and CMT-3.

### B.4 Attachment — `schema.prisma:439-454` (table `attachments`)
| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | String | no | uuid | |
| ticketId | String | yes | – | Cascade |
| commentId | String | yes | – | Cascade; set only for PUBLIC emailed replies (`05` §B.11) |
| uploaderName | String | no | – | Display name string, **not** a FK |
| fileName | String | no | – | Original name |
| mimeType | String | no | – | Client-declared |
| sizeBytes | Int | no | – | |
| storagePath | String | no | – | Absolute server path: **ignore it, never display it** |
| createdAt | DateTime | no | now | |

There is no URL field. Build URLs as `/api/v1/tickets/{ticketId}/attachments/{id}/view|download` (ATT-3, ATT-4).

### B.5 TicketTask ("Task") — `schema.prisma:1664-1682` (table `ticket_tasks`)
| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | String | no | uuid | |
| ticketId | String | no | – | Cascade |
| title | String | no | – | 1–255 |
| description | String | yes | – | |
| assignedToId | String | yes | – | FK User (SetNull) |
| status | TaskStatus | no | `OPEN` | |
| dueDate | DateTime | yes | – | Send as UTC ISO `Z` |
| sortOrder | Int | no | `0` | |
| completedAt | DateTime | yes | – | Set or cleared by the server on status change (not on create) |
| createdAt / updatedAt | DateTime | no | | |

**`assignedTo` in the API:** `{id,displayName,email,avatarUrl}` in TSK-*; `{id,displayName,email}` inside `TicketDTO.tasks`.

### B.6 Team — `schema.prisma:199-229` and TeamMember `:231-243`
| Team field | Type | Null | Default |
|---|---|---|---|
| id | String | no | uuid |
| name | String | no | – (unique) |
| description | String | yes | – |
| isActive | Boolean | no | `true` |
| slaPolicyId, slaPolicyP1Id..P4Id | String | yes | – (P1=URGENT, P2=HIGH, P3=MEDIUM, P4=LOW) |
| countryId | String | yes | – |
| createdAt / updatedAt | DateTime | no | |

| TeamMember field | Type | Null | Default |
|---|---|---|---|
| id | String | no | uuid |
| teamId, userId | String | no | – (unique pair) |
| isLead | Boolean | no | `false` |
| joinedAt | DateTime | no | now |

**In the API:** LKP-2 returns `members[{...TeamMember, user:{id,displayName,email}}]` and `slaPolicy:{id,name}|null`; LKP-3 adds `user.role` and returns the full `slaPolicy`.

### B.7 Category — `schema.prisma:249-276`
| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | String | no | uuid | |
| name | String | no | – | **Not unique.** "Auto Category" is a magic name |
| description | String | yes | – | |
| parentId | String | yes | – | Self-relation tree |
| sortOrder | Int | no | `0` | |
| level | String | no | `"CATEGORY"` | `CATEGORY` / `SUBCATEGORY` / `ITEM` |
| isActive | Boolean | no | `true` | |
| defaultTeamId | String | yes | – | |
| defaultAssigneeId | String | yes | – | |
| countryId | String | yes | – | null = all countries |
| keywords | String[] | no | `[]` | Used for server auto-categorisation |
| createdAt | DateTime | no | now | |

**In the API (LKP-1):** scalars + `defaultTeam:{id,name}|null` + `defaultAssignee:{id,displayName}|null` + `children[]` (ignore it). Inside tickets: the `category` chain (B.1).

### B.8 Priority (enum + PriorityMatrix) — `schema.prisma:36-41, 1556-1564`
- `TicketPriority` enum (§A).
- **PriorityMatrix:** `{ id: String uuid, impact: TicketImpact, urgency: TicketUrgency, priority: TicketPriority }`, unique on `(impact, urgency)`.
- **Default rows** (seeded on first GET of LKP-6):

| Impact \ Urgency | HIGH | MEDIUM | LOW |
|---|---|---|---|
| HIGH | URGENT | HIGH | MEDIUM |
| MEDIUM | HIGH | MEDIUM | LOW |
| LOW | MEDIUM | LOW | LOW |

  `MINIMAL` impact and `URGENT` urgency have no default rows.

### B.9 Status — `schema.prisma:21-34`
- The `TicketStatus` enum (§A). There is **no table**.
- Allowed transitions: `05` §A.1 (client-enforced).
- Labels and colours: `05` §A.10.

### B.10 Embedded / supporting models
| Model | Lines | Fields mobile sees |
|---|---|---|
| **Country** | `:1374-1404` | `id, code (VarChar 2, unique), name (unique), displayName, timezone (default "UTC"), currency, dateFormat, businessLanguage, isActive (default true)`. Inside tickets: `{id,name,displayName}` |
| **SLAPolicy** | `:282-318` | `id, name (unique), description?, isActive, respondTimeUrgent/High/Medium/Low (min; defaults 60/240/480/1440), resolveTimeUrgent/High/Medium/Low (defaults 240/480/1440/2880), businessHoursOnly (true), businessHoursStart (9), businessHoursEnd (18), businessDays Int[] ([1..5]), timezone ("UTC"), operationalHoursId?, countryId?, createdAt, updatedAt` |
| **Notification** | `:488-505` | `id, userId, ticketId?, type: NotificationType, title, body, isRead (false), readAt?, createdAt`, + `ticket:{id,ticketNumber,title}` on NTF-1 |
| **AuditLog** | `:558-577` | `id, ticketId?, actorId?, action: AuditAction, entityType (string: 'Ticket', 'Comment', 'Attachment'…), entityId, oldValues Json?, newValues Json?, ipAddress?, createdAt`, + `actor:{id,displayName}` on TKT-7 |
| **Session** | `:179-193` | never exposed (token only) |
| Approval | `:763-783` | Phase 2: see the interface |
| Announcement | `:1010-1028` | Phase 2 |
| KBCategory / KBArticle | `:511-552` | Phase 2 |
| ServiceCategory / ServiceItem / ServiceRequest | `:927-997` | Phase 2. `ServiceRequest.status` reuses `TicketStatus`; `requestNumber` is an autoincrement Int |

---

## C. Copy-ready TypeScript (API response shapes)

> - Copy this block verbatim into `src/types/api.ts` when development starts. **Do not edit it by hand.** Change the doc first (with Ronit's OK), then re-copy.
> - `ISODateString` is a plain string alias. Parse it with date-fns `parseISO`.
> - Fields marked `?` may be **absent**; `| null` means present but possibly null.

```ts
// ─────────────────────────────────────────────────────────────
// MMG Ticketing — API types (generated from docs/web-system/03-DATA-MODEL.md, 2026-10-09)
// Source of truth: backend/prisma/schema.prisma + controller include/select
// ─────────────────────────────────────────────────────────────

export type ISODateString = string;
export type UUID = string;

// ── Enums ────────────────────────────────────────────────────
export const USER_ROLES = ['ADMIN', 'AGENT', 'END_USER', 'L2_MANAGER'] as const;
export type UserRole = typeof USER_ROLES[number];

export const TICKET_STATUSES = [
  'OPEN', 'IN_PROGRESS', 'PENDING', 'PENDING_USER_INFO', 'PENDING_USER_CONFIRM', 'PENDING_PARTNER',
  'PENDING_MASTER_DATA', 'PENDING_MGMT_REVIEW', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELED',
] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];

export const HOLD_STATUSES: readonly TicketStatus[] = [
  'ON_HOLD', 'PENDING', 'PENDING_MGMT_REVIEW', 'PENDING_MASTER_DATA', 'PENDING_PARTNER',
  'PENDING_USER_CONFIRM', 'PENDING_USER_INFO',
];

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TicketPriority = typeof TICKET_PRIORITIES[number];

export const TICKET_IMPACTS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type TicketImpact = typeof TICKET_IMPACTS[number];

export const TICKET_URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TicketUrgency = typeof TICKET_URGENCIES[number];

export const TICKET_SOURCES = ['WEB_FORM', 'EMAIL', 'PORTAL', 'API'] as const;
export type TicketSource = typeof TICKET_SOURCES[number];

export const SLA_STATUSES = ['WITHIN_SLA', 'DUE_SOON', 'BREACHED'] as const;
export type SLAStatus = typeof SLA_STATUSES[number];

export type CommentType = 'PUBLIC' | 'PRIVATE';

export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export type NotificationType =
  | 'TICKET_ASSIGNED' | 'TICKET_UPDATED' | 'TICKET_RESOLVED'
  | 'SLA_WARNING' | 'SLA_BREACHED' | 'COMMENT_ADDED' | 'MENTION';

export type AuditAction =
  | 'CREATED' | 'UPDATED' | 'DELETED' | 'STATUS_CHANGED' | 'ASSIGNED'
  | 'COMMENTED' | 'ATTACHMENT_ADDED' | 'SLA_BREACHED' | 'ESCALATED';

export type CategoryLevel = 'CATEGORY' | 'SUBCATEGORY' | 'ITEM';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ApprovalEntityType = 'ticket' | 'change' | 'service_request';
export type AnnouncementType = 'INFO' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE';

export const CLOSURE_CODES = [
  'Resolved – Issue Fixed', 'Resolved – Workaround Provided', 'Closed – Duplicate',
  "Closed – Won't Fix", 'Cannot Reproduce', 'Other',
] as const; // U+2013 en dashes — keep exact

// ── Envelopes ────────────────────────────────────────────────
export interface ApiError {
  error: string;
  details?: Record<string, string[]>;           // only on 400 "Validation error"
}

/** Shape (a) — utils/pagination.ts */
export interface Paginated<T> {
  data: T[]; total: number; page: number; limit: number;
  totalPages: number; hasNext: boolean; hasPrev: boolean;
}

/** Shape (b) — hand-rolled (approvals list, service requests) */
export interface SimplePage<T> { data: T[]; total: number; page: number; limit: number; }

/** Shape (c) — GET /tickets/:id/activity */
export interface ActivityPage {
  items: ActivityItem[]; auditTotal: number; page: number; pageSize: number; auditPages: number;
}

// ── Users ────────────────────────────────────────────────────
/** GET /auth/me → { user: AuthUser }  (from session cache; may be stale) */
export interface AuthUser {
  id: UUID; email: string; displayName: string; role: UserRole;
  ldapSamAccount: string | null; countryId: string | null;
}
export interface AuthMeResponse { user: AuthUser; }
export interface AuthConfigResponse { microsoftEnabled: boolean; localAuthEnabled: boolean; }

/** PENDING (A1/A2) — not in the API yet; shape to be agreed with the backend team */
export interface MobileLoginResponse { token: string; expiresAt: ISODateString; user: AuthUser; }

/** GET /users/:id */
export interface UserProfile {
  id: UUID; email: string; displayName: string; role: UserRole; isActive: boolean;
  department: string | null; phone: string | null; timezone: string;
  lastLoginAt: ISODateString | null; createdAt: ISODateString;
}
/** PUT /users/:id response */
export interface UserProfileUpdated {
  id: UUID; email: string; displayName: string; role: UserRole; isActive: boolean;
  department: string | null; phone: string | null; timezone: string;
}
/** GET /users/search */
export interface UserSearchResult { id: UUID; email: string; displayName: string; role: UserRole; }

/** Generic user reference used inside other resources */
export interface UserRef { id: UUID; displayName: string; email: string; }
export interface UserRefWithAvatar extends UserRef { avatarUrl: string | null; }
/** GET /tickets/:id/suggested-assignees item */
export type SuggestedAssignee = UserRefWithAvatar;

/** Ticket.requester (TICKET_INCLUDE) */
export interface TicketRequester extends UserRefWithAvatar {
  phone: string | null; department: string | null; timezone: string; role: UserRole; countryId: string | null;
}

// ── Reference data ───────────────────────────────────────────
/** GET /countries, /countries/my-countries */
export interface Country {
  id: string; code: string; name: string; displayName: string; timezone: string;
  currency: string; dateFormat: string; businessLanguage: string; isActive: boolean;
}
export interface CountryRef { id: string; name: string; displayName: string; }

/** GET /categories?flat=true — one row (ignore `children`) */
export interface Category {
  id: UUID; name: string; description: string | null; parentId: UUID | null; sortOrder: number;
  level: CategoryLevel; isActive: boolean; defaultTeamId: UUID | null; defaultAssigneeId: UUID | null;
  countryId: string | null; keywords: string[]; createdAt: ISODateString;
  defaultTeam: { id: UUID; name: string } | null;
  defaultAssignee: { id: UUID; displayName: string } | null;
  children?: unknown[];   // not filtered by isActive — DO NOT USE
}
/** Ticket.category chain (TICKET_INCLUDE) */
export interface TicketCategoryRef {
  id: UUID; name: string; level: CategoryLevel; parentId: UUID | null;
  parent: {
    id: UUID; name: string; level: CategoryLevel; parentId: UUID | null;
    parent: { id: UUID; name: string; level: CategoryLevel } | null;
  } | null;
}

export interface TeamRef { id: UUID; name: string; }
export interface TeamMember {
  id: UUID; teamId: UUID; userId: UUID; isLead: boolean; joinedAt: ISODateString;
  user: UserRef & { role?: UserRole };        // role only on GET /teams/:id
}
/** GET /teams */
export interface Team {
  id: UUID; name: string; description: string | null; isActive: boolean;
  slaPolicyId: UUID | null; slaPolicyP1Id: UUID | null; slaPolicyP2Id: UUID | null;
  slaPolicyP3Id: UUID | null; slaPolicyP4Id: UUID | null; countryId: string | null;
  createdAt: ISODateString; updatedAt: ISODateString;
  members: TeamMember[];
  slaPolicy: SLAPolicyRef | SLAPolicy | null;  // {id,name} on list; full on GET /teams/:id
}

export interface SLAPolicyRef { id: UUID; name: string; }
export interface SLAPolicy extends SLAPolicyRef {
  description: string | null; isActive: boolean;
  respondTimeUrgent: number; respondTimeHigh: number; respondTimeMedium: number; respondTimeLow: number;
  resolveTimeUrgent: number; resolveTimeHigh: number; resolveTimeMedium: number; resolveTimeLow: number;
  businessHoursOnly: boolean; businessHoursStart: number; businessHoursEnd: number; businessDays: number[];
  timezone: string; operationalHoursId: UUID | null; countryId: string | null;
  createdAt: ISODateString; updatedAt: ISODateString;
}

/** GET /priority-matrix item */
export interface PriorityMatrixEntry { id: UUID; impact: TicketImpact; urgency: TicketUrgency; priority: TicketPriority; }

/** GET /canned-responses → { data: CannedResponse[] } */
export interface CannedResponse { id: UUID; title: string; body: string; category: string | null; }

// ── Tickets ──────────────────────────────────────────────────
export interface TicketTaskEmbedded {
  id: UUID; ticketId: UUID; title: string; description: string | null; assignedToId: UUID | null;
  status: TaskStatus; dueDate: ISODateString | null; sortOrder: number; completedAt: ISODateString | null;
  createdAt: ISODateString; updatedAt: ISODateString;
  assignedTo: UserRef | null;                  // no avatarUrl inside tickets
}

/** Scalars + TICKET_INCLUDE — returned by TKT-1 (rows), TKT-2, TKT-4, TKT-5, TKT-6 */
export interface Ticket {
  id: UUID; ticketNumber: number; title: string; description: string /* HTML */;
  status: TicketStatus; priority: TicketPriority; impact: TicketImpact | null; urgency: TicketUrgency | null;
  source: TicketSource;
  requesterId: UUID; assignedToId: UUID | null; teamId: UUID | null; categoryId: UUID | null; countryId: string | null;
  tags: string[]; slaPolicyId: UUID | null; slaStatus: SLAStatus;
  firstResponseAt: ISODateString | null; resolvedAt: ISODateString | null; closedAt: ISODateString | null;
  slaResponseDue: ISODateString | null; slaResolveDue: ISODateString | null;
  slaBreachedAt: ISODateString | null; slaBreachNotifiedAt: ISODateString | null;
  slaHoldStartedAt: ISODateString | null; slaHoldMinutes: number;
  lastRequesterReplyAt?: ISODateString | null;  // guaranteed only on TKT-1
  emailMessageId: string | null; emailThreadId: string | null;
  level: string | null; mode: string | null;
  resolution: string | null; closureCode: string | null; isFcr: boolean | null; closureComments: string | null;
  customFields: Record<string, unknown> | null;
  createdAt: ISODateString; updatedAt: ISODateString;
  // relations (TICKET_INCLUDE)
  requester: TicketRequester;
  assignedTo: UserRefWithAvatar | null;
  team: TeamRef | null;
  country: CountryRef | null;
  category: TicketCategoryRef | null;
  slaPolicy: SLAPolicyRef | null;
  _count: { comments: number; attachments: number };
  tasks: TicketTaskEmbedded[];
}
/** GET /tickets/:id — same, but slaPolicy is the full row */
export interface TicketDetail extends Omit<Ticket, 'slaPolicy'> { slaPolicy: SLAPolicy | null; }

/** GET /tickets/:id/sla */
export interface TicketSlaInfo {
  slaStatus: SLAStatus; slaResponseDue: ISODateString | null; slaResolveDue: ISODateString | null;
  firstResponseAt: ISODateString | null; resolvedAt: ISODateString | null; slaBreachedAt: ISODateString | null;
  policy: SLAPolicy | null;
}
/** GET /tickets/:id/email-recipients */
export interface EmailRecipients { to: string[]; cc: string[]; from: string; }

// ── Ticket list query (TKT-1) ────────────────────────────────
export interface TicketListQuery {
  page?: number; limit?: number;                 // NEVER `pageSize`
  status?: string;                               // single or comma list of TicketStatus
  priority?: TicketPriority; impact?: TicketImpact; urgency?: TicketUrgency;
  assignedToId?: UUID | 'unassigned'; teamId?: UUID; categoryId?: UUID; requesterId?: UUID;
  sla?: SLAStatus; fromDate?: string; toDate?: string;   // 'YYYY-MM-DD' (UTC days)
  search?: string; countryId?: string;           // '' = all countries (key present)
  sortBy?: 'priority' | 'sla';                   // omit = updatedAt desc
}

// ── Ticket request bodies (per-role allow-lists — see 01 TKT-2/4/6) ──
export interface CreateTicketBodyEndUser {
  title: string; description: string; categoryId: UUID; source: TicketSource;
}
export interface CreateTicketBodyStaff extends CreateTicketBodyEndUser {
  impact?: TicketImpact; urgency?: TicketUrgency; teamId?: UUID; assignedToId?: UUID; requesterId?: UUID;
}
export interface UpdateTicketBody {           // staff fields; END_USER: title/description only
  title?: string; description?: string; categoryId?: UUID | null; impact?: TicketImpact; urgency?: TicketUrgency;
  teamId?: UUID | null; assignedToId?: UUID | null; tags?: string[]; resolution?: string; countryId?: string | null;
  priority?: TicketPriority;                  // ADMIN/AGENT only, = the LKP-6 value, only with impact/urgency (01 TKT-4, G2)
}
export interface AssignTicketBody { assignedToId?: UUID | null; teamId?: UUID; }
export interface ChangeStatusBody {
  status: TicketStatus;
  resolution?: string; closureCode?: typeof CLOSURE_CODES[number]; isFcr?: boolean; closureComments?: string;
}

// ── Comments ─────────────────────────────────────────────────
export interface Comment {
  id: UUID; ticketId: UUID; authorId: UUID; body: string /* HTML */; type: CommentType; isEdited: boolean;
  toRecipients: string[]; ccRecipients: string[];
  createdAt: ISODateString; updatedAt: ISODateString;
  author: UserRefWithAvatar | UserRef;         // no avatarUrl after PUT
  attachments?: Attachment[];                  // only on GET /comments
}
export interface CreateCommentBody {
  body: string; type: CommentType; to?: string[]; cc?: string[]; attachmentIds?: UUID[];
}

// ── Attachments ──────────────────────────────────────────────
export interface Attachment {
  id: UUID; ticketId: UUID | null; commentId: UUID | null; uploaderName: string;
  fileName: string; mimeType: string; sizeBytes: number;
  storagePath: string;                          // server path — never display
  createdAt: ISODateString;
}
export type AttachmentLite = Pick<Attachment, 'id' | 'fileName' | 'mimeType' | 'storagePath'>;

// ── Tasks ────────────────────────────────────────────────────
export interface TicketTask extends Omit<TicketTaskEmbedded, 'assignedTo'> {
  assignedTo: UserRefWithAvatar | null;
}
export interface TaskBody {
  title?: string; description?: string | null; assignedToId?: UUID | null;
  status?: TaskStatus; dueDate?: ISODateString | null /* full UTC ISO 'Z' */; sortOrder?: number;
}

// ── Activity (TKT-7) ─────────────────────────────────────────
export interface ActivityCommentItem extends Omit<Comment, 'attachments' | 'author'> {
  _type: 'comment';
  author: UserRefWithAvatar;
  attachments: AttachmentLite[];
}
export interface ActivityAuditItem {
  _type: 'audit';
  id: UUID; ticketId: UUID | null; actorId: UUID | null; action: AuditAction;
  entityType: string; entityId: string;
  oldValues: Record<string, unknown> | null;   // may contain _<key>Name enrichments
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;                     // never display
  createdAt: ISODateString;
  actor: { id: UUID; displayName: string } | null;
}
export type ActivityItem = ActivityCommentItem | ActivityAuditItem;

// ── Notifications ────────────────────────────────────────────
export interface Notification {
  id: UUID; userId: UUID; ticketId: UUID | null; type: NotificationType;
  title: string; body: string; isRead: boolean; readAt: ISODateString | null; createdAt: ISODateString;
  ticket?: { id: UUID; ticketNumber: number; title: string } | null;   // on NTF-1
}
export interface UnreadCount { count: number; }

// ── Dashboard (DSH-1) ────────────────────────────────────────
export interface DashboardKpis {
  total: number; open: number; inProgress: number; onHold: number;
  pendingMgmtReview: number; pendingPartner: number; pendingUserConfirm: number;
  pendingUserInfo: number; pendingMasterData: number; pending: number;
  resolvedToday: number; resolved: number; closed: number; slaBreached: number; unassigned: number;
  totalOpen: number; currentlyOpen: number; createdToday: number; createdYesterday: number;
  closedToday: number; closedYesterday: number; slaBreachPercent: number;
}
export interface DashboardRecentTicket
  extends Omit<Ticket, 'requester' | 'assignedTo' | 'team' | 'country' | 'category' | 'slaPolicy' | '_count' | 'tasks'> {
  requester: { displayName: string };
  assignedTo: { displayName: string } | null;
}
export interface DashboardAll {
  kpis: DashboardKpis;
  byStatus: { status: TicketStatus; count: number }[];
  byPriority: { priority: TicketPriority; count: number }[];
  recent: DashboardRecentTicket[];
  // Present but NOT used by mobile MVP (scoping defects — 05 §B.20):
  workload: unknown; trends: unknown; technicianMatrix: unknown; teamMatrix: unknown; bySource: unknown;
  countryGroupRows: unknown; technicianPriorityBreakdown: unknown; technicianSLABreaches: unknown;
  technicianClosedToday: unknown; technicianClosedThisWeek: unknown; monthlyTrends: unknown;
}
export type DashboardRange = 'today' | 'yesterday' | 'last7' | 'week' | 'last30' | 'month' | 'quarter' | 'year' | 'all';

// ── Phase 2 ──────────────────────────────────────────────────
export interface Approval {
  id: UUID; entityType: ApprovalEntityType; entityId: UUID; stage: number; approverId: UUID;
  status: ApprovalStatus; comments: string | null; decidedAt: ISODateString | null;
  changeId: UUID | null; serviceRequestId: UUID | null; createdAt: ISODateString;
  approver: UserRef | null;
  change: { id: UUID; changeNumber: number; title: string; status: string } | null;
  serviceRequest: (ServiceRequestScalars & { serviceItem: { id: UUID; name: string } }) | null;
}
/** APR-4 POST /approvals (G3). Server: entityType any string, approverIds min 1, comments optional (approvals.controller.ts:17-22) */
export interface CreateApprovalBody {
  entityType: 'ticket';                        // mobile submits tickets only
  entityId: UUID; approverIds: UUID[]; comments?: string;
}

export interface Announcement {
  id: UUID; title: string; body: string; type: AnnouncementType; authorId: UUID;
  isActive: boolean; isPinned: boolean; startsAt: ISODateString; expiresAt: ISODateString | null;
  targetRoles: string[]; createdAt: ISODateString; updatedAt: ISODateString;
  author: { id: UUID; displayName: string };
}

export interface KBCategory {
  id: UUID; name: string; description: string | null; parentId: UUID | null; sortOrder: number;
  isPublic: boolean; createdAt: ISODateString; children?: KBCategory[];
}
export interface KBArticleListItem {
  id: UUID; title: string; slug: string; excerpt: string | null; tags: string[];
  viewCount: number; helpfulCount: number; isPublished: boolean; isPublic: boolean;
  publishedAt: ISODateString | null;
  author: { displayName: string }; category: { name: string } | null;
}
export interface KBSearchResult { id: UUID; title: string; slug: string; excerpt: string | null; tags: string[]; }
export interface KBArticle {
  id: UUID; title: string; slug: string; body: string /* HTML */; excerpt: string | null;
  categoryId: UUID | null; authorId: UUID; tags: string[]; isPublished: boolean; isPublic: boolean;
  viewCount: number; helpfulCount: number; publishedAt: ISODateString | null;
  createdAt: ISODateString; updatedAt: ISODateString; ticketCategoryId: UUID | null;
  author: { displayName: string }; category: { name: string } | null;
}

export interface ServiceFormField {
  name: string; label: string;
  type?: 'text' | 'textarea' | 'date' | 'phone' | 'email' | 'number' | 'select';  // unknown → text
  required?: boolean; placeholder?: string;
  options?: (string | { value: string; label: string })[];
}
export interface ServiceItem {
  id: UUID; name: string; description: string | null; categoryId: UUID | null; icon: string | null;
  estimatedTime: number | null; requiresApproval: boolean; approverIds: UUID[];
  formFields: ServiceFormField[] | null;       // server does not validate
  isActive: boolean; sortOrder: number; createdAt: ISODateString; updatedAt: ISODateString;
  category?: { id: UUID; name: string } | null;
}
export interface ServiceCategory {
  id: UUID; name: string; description: string | null; icon: string | null; sortOrder: number;
  isActive: boolean; createdAt: ISODateString; services: ServiceItem[];
}
export interface ServiceRequestScalars {
  id: UUID; requestNumber: number; serviceItemId: UUID; requesterId: UUID; assignedToId: UUID | null;
  teamId: UUID | null; countryId: string | null; status: TicketStatus; priority: TicketPriority;
  slaPolicyId: UUID | null; slaStatus: SLAStatus; slaResponseDue: ISODateString | null;
  slaResolveDue: ISODateString | null; slaBreachedAt: ISODateString | null; firstResponseAt: ISODateString | null;
  formData: Record<string, unknown> | null; notes: string | null;
  resolvedAt: ISODateString | null; closedAt: ISODateString | null; createdAt: ISODateString; updatedAt: ISODateString;
}
export interface ServiceRequest extends ServiceRequestScalars {
  serviceItem: { id: UUID; name: string; requiresApproval: boolean; estimatedTime: number | null };
  requester: UserRef; assignedTo: UserRef | null; team: TeamRef | null;
  approvals: (Omit<Approval, 'change' | 'serviceRequest'> & { approver: UserRef | null })[];
}
export interface CreateServiceRequestBody {
  serviceItemId: UUID; priority?: TicketPriority; formData: Record<string, unknown>; notes?: string | null;
}
```

**Type-to-endpoint map**
- **Tickets**
  - TKT-1 → `Paginated<Ticket>`
  - TKT-2, TKT-4, TKT-5, TKT-6 → `Ticket`
  - TKT-3 → `TicketDetail`
  - TKT-7 → `ActivityPage`
  - TKT-8 → `TicketSlaInfo`
  - TKT-9 → `EmailRecipients`
  - TKT-10 → `SuggestedAssignee[]`
- **Comments, attachments, tasks**
  - CMT-1 → `Comment[]` (with `attachments`)
  - CMT-2 / CMT-3 → `Comment`
  - ATT-1 / ATT-2 → `Attachment[]`
  - TSK-1 → `TicketTask[]`
  - TSK-2 / TSK-3 → `TicketTask`
- **Users and auth**
  - AUTH-1 → `AuthConfigResponse`
  - AUTH-2 → `AuthMeResponse`
  - USR-1 → `UserProfile`
  - USR-2 → `UserProfileUpdated`
  - USR-3 → `UserSearchResult[]`
- **Lookups**
  - LKP-1 → `Category[]`
  - LKP-2 → `Team[]`
  - LKP-4 / LKP-5 → `Country[]`
  - LKP-6 → `PriorityMatrixEntry[]`
  - LKP-7 → `{ data: CannedResponse[] }`
- **Dashboard and notifications**
  - DSH-1 → `DashboardAll`
  - NTF-1 → `Paginated<Notification>`
  - NTF-2 → `UnreadCount`
- **Phase 2**
  - APR-1 → `Approval[]`; APR-2 / APR-3 → `Approval`
  - APR-4 → body `CreateApprovalBody`, 201 `Approval[]` (G3)
  - ATT-5 → `{ message: string }` (G3)
  - ANN-1 → `Announcement[]`
  - KB-1 → `KBCategory[]`
  - KB-2 → `Paginated<KBArticleListItem>`
  - KB-3 → `KBSearchResult[]`
  - KB-4 → `KBArticle`
  - SCR-1 → `ServiceCategory[]`
  - SCR-2 / SCR-3 → `ServiceItem`
  - SCR-4 → `SimplePage<ServiceRequest>`
  - SCR-5 / SCR-6 → `ServiceRequest`
