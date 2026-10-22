// Service catalogue rules (Phase G4): browsing, the dynamic request form, its validation and the request body, as the
// web portal does them. Expected behaviour, with a source line for every rule: docs/G4-WEB-CATALOGUE.md
// (SCP = FE:pages/service-catalog/ServiceCatalogPage.tsx, SRF = FE:pages/service-catalog/ServiceRequestFormPage.tsx).
// Who may do what is decided in utils/permissions.ts (serviceCatalogPermissions). Pure functions, no UI.
import type { CreateServiceRequestBody, ServiceItem, TicketImpact, TicketPriority } from '@/types';

// ── Browsing (G4 §2) ─────────────────────────────────────────

type BrowseItem = Pick<ServiceItem, 'name' | 'description' | 'categoryId'>;

/**
 * The item list under the search box (SCP:55-66): the selected category's items, then, while the search is not blank,
 * those whose name or description contains the trimmed search, ignoring case. The server's order is kept.
 * No category and no search is the Home view, which lists categories instead (SCP:410).
 */
export function filterCatalogItems<T extends BrowseItem>(items: readonly T[], categoryId: string | null, search: string): T[] {
  let list = items.filter(Boolean);
  if (categoryId) list = list.filter((i) => i.categoryId === categoryId);
  const q = search.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (i) => (typeof i.name === 'string' && i.name.toLowerCase().includes(q)) || (typeof i.description === 'string' && i.description.toLowerCase().includes(q)),
    );
  }
  return list;
}

/** "n items" on a category row: counted from the SCR-2 item list, not SCR-1's `services` (SCP:422). */
export function categoryItemCount(items: readonly BrowseItem[], categoryId: string): number {
  return items.filter((i) => i?.categoryId === categoryId).length;
}

/** "1 item" / "3 items" (SCP:436, :450). */
export function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

// ── Field definitions (G4 §4) ────────────────────────────────

/** The seven types the web's renderer switches on (SRF:191-221). Anything else renders as `text`. */
export const SERVICE_FIELD_TYPES = ['text', 'textarea', 'date', 'phone', 'email', 'number', 'select'] as const;
export type ServiceFieldType = (typeof SERVICE_FIELD_TYPES)[number];

export interface ServiceFieldOption {
  value: string;
  label: string;
}

/** One custom field, normalised from the free JSON in `ServiceItem.formFields` (the server never validates it). */
export interface ServiceField {
  name: string;
  /** The definition's label, or its name when it has none (the web shows nothing and says "undefined is required"). */
  label: string;
  /** Exact, case-sensitive match on the seven types; anything else (`checkbox`, `Textarea`, missing …) is `text`. */
  type: ServiceFieldType;
  /** Any truthy `required` counts, as on the web (`field.required ? … : false`, SRF:185). */
  required: boolean;
  /** For text, textarea, phone, email and number; phone defaults to "Enter phone number" (SRF:199). Date has none. */
  placeholder: string | undefined;
  /** Select only: the first, empty entry's label, `placeholder ?? '-- Select --'` (SRF:210). */
  emptyLabel: string;
  /** Select only. Never contains an empty value: choosing "" is choosing the empty entry. */
  options: ServiceFieldOption[];
}

export interface ServiceFormDefinition {
  fields: ServiceField[];
  /**
   * Entries that cannot be shown: not an object, no usable `name` (or one react-hook-form cannot store), or a repeated
   * name. The web crashes or binds them oddly (G4 §4.5); the app skips them and says so.
   */
  skipped: number;
}

const FORBIDDEN_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * How react-hook-form 7 splits a field path (its `isKey` / `stringToPath`): a plain word is one key; otherwise quotes and
 * `]` are dropped and the rest is split on `.` and `[`, empty pieces removed. The web registers `formData.<name>`
 * (SRF:184), so a name with dots or brackets becomes a nested object or array in `formData` (G4 §4.5).
 */
export function rhfPath(path: string): string[] {
  if (/^\w*$/.test(path)) return [path];
  return path.replace(/["|']|\]/g, '').split(/\.|\[/).filter(Boolean);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/** react-hook-form 7's `set`: walk the path, creating `[]` when the next key is numeric and `{}` otherwise. */
function rhfSet(root: Record<string, unknown>, path: string, value: unknown): void {
  const keys = rhfPath(path);
  if (keys.some((k) => FORBIDDEN_PATH_KEYS.has(k))) return;
  let target: Record<string, unknown> = root;
  keys.forEach((key, index) => {
    let next: unknown = value;
    if (index !== keys.length - 1) {
      const current = target[key];
      next = isPlainObject(current) || Array.isArray(current) ? current : !Number.isNaN(Number(keys[index + 1])) ? [] : {};
    }
    target[key] = next;
    target = next as Record<string, unknown>;
  });
}

/** A name the form can store: non-empty, and one that does not collapse onto `formData` itself or a prototype key. */
function usableName(name: unknown): name is string {
  if (typeof name !== 'string' || name === '') return false;
  const keys = rhfPath(`formData.${name}`);
  return keys.length >= 2 && keys[0] === 'formData' && !keys.some((k) => FORBIDDEN_PATH_KEYS.has(k));
}

/** A string or number as display text; anything else (null, objects, booleans, '') is none. */
function textOf(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}

/**
 * Select options (SRF:211-216): a string is both value and label; an object gives `value` and `label` (a number value
 * is submitted as a string; with no `value`, an HTML option's value is its text, i.e. the label). `null`, numbers and
 * booleans, which crash the web page or render as a blank entry, are skipped, as are empty and repeated values.
 */
export function normaliseOptions(raw: unknown): ServiceFieldOption[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const options: ServiceFieldOption[] = [];
  for (const opt of raw) {
    let value: string | undefined;
    let label: string | undefined;
    if (typeof opt === 'string') {
      value = opt;
      label = opt;
    } else if (isPlainObject(opt)) {
      label = textOf(opt.label);
      value = textOf(opt.value) ?? label;
      label = label ?? value;
    }
    if (!value || label === undefined || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label });
  }
  return options;
}

/** `ServiceItem.formFields` → the fields to render, in the definition's order (SRF:405-414). */
export function normaliseFormFields(raw: unknown): ServiceFormDefinition {
  // null, missing or a non-array: no custom-field section (SRF:405). A string crashes the web page; here, no fields.
  if (!Array.isArray(raw)) return { fields: [], skipped: 0 };
  const fields: ServiceField[] = [];
  const names = new Set<string>();
  let skipped = 0;
  for (const entry of raw) {
    if (!isPlainObject(entry) || !usableName(entry.name) || names.has(entry.name)) {
      skipped += 1;
      continue;
    }
    names.add(entry.name);
    const type: ServiceFieldType =
      typeof entry.type === 'string' && (SERVICE_FIELD_TYPES as readonly string[]).includes(entry.type) ? (entry.type as ServiceFieldType) : 'text';
    const label = textOf(entry.label)?.trim() ? (textOf(entry.label) as string) : entry.name;
    const placeholder = textOf(entry.placeholder);
    fields.push({
      name: entry.name,
      label,
      type,
      required: !!entry.required,
      placeholder: type === 'date' ? undefined : type === 'phone' ? (placeholder ?? 'Enter phone number') : placeholder,
      emptyLabel: placeholder ?? '-- Select --',
      options: type === 'select' ? normaliseOptions(entry.options) : [],
    });
  }
  return { fields, skipped };
}

// ── Values and validation (G4 §4.1, §4.2) ────────────────────

/** Field name → the text in its control. */
export type ServiceFormValues = Record<string, string>;

/** Every field starts empty and a select on its empty entry; nothing is prefilled (SRF:87, G4 §4.4). */
export function initialFormValues(fields: readonly ServiceField[]): ServiceFormValues {
  return Object.fromEntries(fields.map((f) => [f.name, '']));
}

/**
 * What the web would submit for this control's text: the HTML value sanitising of each input type. Single-line inputs
 * drop line breaks; an e-mail input also trims surrounding spaces; a textarea's line breaks become `\n`. A number is
 * trimmed (the web's number input cannot hold spaces at all). Dates and selects are as picked.
 */
export function submittedValue(field: Pick<ServiceField, 'type'>, raw: string | undefined): string {
  const text = typeof raw === 'string' ? raw : '';
  switch (field.type) {
    case 'textarea':
      return text.replace(/\r\n?/g, '\n');
    case 'email':
      return text.replace(/[\r\n]/g, '').replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
    case 'number':
      return text.trim();
    case 'date':
    case 'select':
      return text;
    default:
      return text.replace(/[\r\n]/g, '');
  }
}

/** The HTML Standard's "valid e-mail address" (what `input type="email"` accepts). The domain needs no dot. */
export const VALID_EMAIL =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** The HTML Standard's "valid floating-point number": "12", "-3", ".5", "1e3"; not "+1", "1.", "1,000". */
const VALID_NUMBER = /^-?(?:\d+|\d*\.\d+)(?:[eE][-+]?\d+)?$/;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" naming a real calendar day (what a date input holds). */
export function isRealDay(value: string): boolean {
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
}

/**
 * "YYYY-MM-DD" → that day at local noon (the date picker's starting value and the display date), or null. Any year: the
 * web's date input has no `min` or `max`.
 */
export function localDateFromDay(value: string): Date | null {
  if (!isRealDay(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  date.setFullYear(y); // years 0–99 would otherwise be read as 1900–1999
  return date;
}

export const EMAIL_FORMAT_MESSAGE ='Enter a valid email address, like name@example.com.';
export const NUMBER_FORMAT_MESSAGE = 'Enter a number.';
export const WHOLE_NUMBER_MESSAGE = 'Enter a whole number.';
export const DATE_FORMAT_MESSAGE = 'Pick a valid date.';
export const OPTION_MESSAGE = 'Choose one of the options.';

/** `${label} is required` (SRF:185). */
export function requiredMessage(field: Pick<ServiceField, 'label'>): string {
  return `${field.label} is required`;
}

/**
 * Why this field blocks "Add Request", or null.
 * 1. The browser's checks, which run first on the web and only on a non-empty value (no `noValidate`, SRF:246): an
 *    e-mail must be a valid address; a number must be a number and a whole one (no `step`, so 1). The web shows the
 *    browser's own bubble; these messages are the app's.
 * 2. `required` (react-hook-form): only an empty value fails. A value of only spaces passes, as on the web (except in
 *    an e-mail field, whose value the browser trims first).
 * There are no other rules: no min, max, length, pattern or dependency exists on the web.
 */
export function fieldError(field: ServiceField, raw: string | undefined): string | null {
  const value = submittedValue(field, raw);
  if (value !== '') {
    switch (field.type) {
      case 'email':
        if (!VALID_EMAIL.test(value)) return EMAIL_FORMAT_MESSAGE;
        break;
      case 'number': {
        const n = Number(value);
        if (!VALID_NUMBER.test(value) || !Number.isFinite(n)) return NUMBER_FORMAT_MESSAGE;
        if (!Number.isInteger(n)) return WHOLE_NUMBER_MESSAGE;
        break;
      }
      case 'date':
        if (!isRealDay(value)) return DATE_FORMAT_MESSAGE;
        break;
      case 'select':
        if (!field.options.some((o) => o.value === value)) return OPTION_MESSAGE;
        break;
      default:
        break;
    }
  }
  if (field.required && value === '') return requiredMessage(field);
  return null;
}

/** Every failing field → its message, in the form's order. Empty when "Add Request" may send. */
export function formErrors(fields: readonly ServiceField[], values: ServiceFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const message = fieldError(field, values[field.name]);
    if (message) errors[field.name] = message;
  }
  return errors;
}

/**
 * `formData` as the web submits it: every field, untouched ones as "" (react-hook-form records each registered input),
 * each value as a string (no `valueAsNumber`), nested by react-hook-form's path rules for names with dots or brackets.
 */
export function buildFormData(fields: readonly ServiceField[], values: ServiceFormValues): Record<string, unknown> {
  const root: Record<string, unknown> = { formData: {} };
  for (const field of fields) rhfSet(root, `formData.${field.name}`, submittedValue(field, values[field.name]));
  return root.formData as Record<string, unknown>;
}

// ── Request properties: impact, urgency → priority (G4 §3) ──

/** Impact options in the web form's order and wording (SRF:24-29). */
export const REQUEST_IMPACT_OPTIONS: readonly { value: TicketImpact; label: string }[] = [
  { value: 'HIGH', label: 'Affects Business' },
  { value: 'MEDIUM', label: 'Affects Department' },
  { value: 'LOW', label: 'Affects Group' },
  { value: 'MINIMAL', label: 'Affects User' },
];

export type RequestUrgency = 'HIGH' | 'MEDIUM' | 'LOW';

/** Urgency options on this form (SRF:30-34): no Urgent, and MEDIUM reads "Normal". */
export const REQUEST_URGENCY_OPTIONS: readonly { value: RequestUrgency; label: string }[] = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Normal' },
  { value: 'LOW', label: 'Low' },
];

/** The web form's hard-coded map (SRF:113-118). It is not the priority matrix (LKP-6); this endpoint never uses that. */
const REQUEST_PRIORITY_MAP: Record<TicketImpact, Record<RequestUrgency, TicketPriority>> = {
  HIGH: { HIGH: 'URGENT', MEDIUM: 'HIGH', LOW: 'HIGH' },
  MEDIUM: { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'MEDIUM' },
  LOW: { HIGH: 'MEDIUM', MEDIUM: 'LOW', LOW: 'LOW' },
  MINIMAL: { HIGH: 'LOW', MEDIUM: 'LOW', LOW: 'LOW' },
};

/** The priority for both choices, or null while either is missing. */
export function requestPriority(impact: TicketImpact | null, urgency: RequestUrgency | null): TicketPriority | null {
  if (!impact || !urgency) return null;
  return REQUEST_PRIORITY_MAP[impact]?.[urgency] ?? null;
}

/**
 * The Priority after an impact or urgency change (SRF:110-121): set when both are chosen and never cleared, so clearing
 * one keeps the last computed value, on screen and in the request, as on the web. "Reset" clears it.
 */
export function nextRequestPriority(previous: TicketPriority | null, impact: TicketImpact | null, urgency: RequestUrgency | null): TicketPriority | null {
  return requestPriority(impact, urgency) ?? previous;
}

// ── The request body (G4 §5) ─────────────────────────────────

export interface ServiceRequestDraft {
  serviceItemId: string;
  fields: readonly ServiceField[];
  values: ServiceFormValues;
  /** The "Resolution" box. Sent as typed, "" when blank (`data.notes || ''`, SRF:145). */
  notes: string;
  /** Request properties' Priority, or null (the server then stores MEDIUM). Only staff have it. */
  priority: TicketPriority | null;
}

/**
 * The SCR-5 body: exactly the four keys the server keeps (05 §B.24; SCC:26-31). Subject, description, category, group,
 * technician, impact, urgency and files are not sent: the web sends some of them and the server drops them all.
 */
export function buildServiceRequestBody(draft: ServiceRequestDraft): CreateServiceRequestBody {
  return {
    serviceItemId: draft.serviceItemId,
    formData: buildFormData(draft.fields, draft.values),
    notes: draft.notes || '',
    ...(draft.priority ? { priority: draft.priority } : {}),
  };
}

/** "Service request submitted", plus " — pending approval" when the item requires approval (SRF:169). */
export function submittedMessage(item: Pick<ServiceItem, 'requiresApproval'>): string {
  return `Service request submitted${item.requiresApproval ? ' — pending approval' : ''}`;
}

/** "SR-123" (SCP:345). */
export function requestRef(requestNumber: number | null | undefined): string {
  return typeof requestNumber === 'number' ? `SR-${requestNumber}` : 'SR-?';
}

// ── A request's answers, for its detail screen (mobile only; the web never shows them) ──

export interface AnswerRow {
  key: string;
  label: string;
  value: string;
}

function flatten(value: unknown, prefix: string, out: [string, unknown][]): void {
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  } else {
    out.push([prefix, value]);
  }
}

function answerText(value: unknown): string {
  if (typeof value === 'string') return value.trim() ? value : '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '—';
}

/**
 * `formData` as label/value rows: the item's fields first, in its order and with its labels (a select shows the
 * option's label), then any other keys the request carries, by their path. `formData` is free JSON, so only text,
 * numbers and booleans are shown as values.
 */
export function answerRows(formData: unknown, fields: readonly ServiceField[]): AnswerRow[] {
  const flat: [string, unknown][] = [];
  if (isPlainObject(formData)) flatten(formData, '', flat);
  const byPath = new Map(flat);
  const rows: AnswerRow[] = [];
  const used = new Set<string>();
  for (const field of fields) {
    const path = rhfPath(`formData.${field.name}`).slice(1);
    const key = path.reduce((acc, k) => (acc === '' ? k : /^\d+$/.test(k) ? `${acc}[${k}]` : `${acc}.${k}`), '');
    if (!byPath.has(key)) continue;
    used.add(key);
    const raw = byPath.get(key);
    const option = field.type === 'select' ? field.options.find((o) => o.value === raw) : undefined;
    rows.push({ key, label: field.label, value: option ? option.label : answerText(raw) });
  }
  for (const [key, raw] of flat) {
    if (!used.has(key) && key) rows.push({ key, label: key, value: answerText(raw) });
  }
  return rows;
}
