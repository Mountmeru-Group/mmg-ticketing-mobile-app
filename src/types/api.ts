// Shared envelope types. Copied verbatim from 03-DATA-MODEL.md §C ("Envelopes"); the shapes are the
// ones 01-API-CONTRACT.md §0.2 (error envelope) and §0.3 (pagination shapes a–c) document.
import type { ActivityItem } from './ticket';

export type ISODateString = string;
export type UUID = string;

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

// Shape (d) — plain array `T[]` — needs no envelope type.
