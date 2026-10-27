// Ticket links from Service Desk emails → an in-app target (05 §A.11, 04 "Deep-link handler"). Pure functions.
//
// Link shapes the server sends (06 A18, A27):
//   ${APP_URL}/ticket/<ticketNumber>     the web's TicketRedirectPage route (number → ticket)
//   ${APP_URL}/tickets/<uuid>            the web's ticket detail route (approval emails, `ticketUrl`)
//   ${APP_URL}/tickets/<ticketNumber>    the triage email (a web bug A18 reports; handled here anyway)
// APP_URL is the web origin of the environment this build talks to (UAT for every dev build, 00 §3). A link to another
// environment is NOT resolved: its ticket numbers and ids belong to a different database.
// Only links that reach the app are handled — tapped inside a description, comment, announcement or KB article, or
// pasted into the Tickets search box. The OS never routes links to the app: that needs ask A18 (out of scope).
import { API_BASE_URL } from '@/config/env';
import type { AppTab } from './permissions';

export type TicketLinkTarget = { kind: 'id'; id: string } | { kind: 'number'; ticketNumber: number };

export type TicketLinkParse =
  | { ok: true; target: TicketLinkTarget }
  | { ok: false; reason: 'other-environment' | 'not-a-ticket-link' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ticket numbers are autoincrement integers; cap the length so a pasted ID-like string can't overflow. */
const NUMBER_RE = /^\d{1,9}$/;

/** `https://uat-servicedesk.mountmerugroup.com` — the web app's origin for this build's environment. */
export const APP_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

function hostOf(origin: string): string {
  return origin.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
}

function targetFromSegment(segment: string): TicketLinkTarget | null {
  const value = decodeURIComponent(segment).trim();
  if (UUID_RE.test(value)) return { kind: 'id', id: value.toLowerCase() };
  if (NUMBER_RE.test(value)) {
    const ticketNumber = Number(value);
    return ticketNumber > 0 ? { kind: 'number', ticketNumber } : null;
  }
  return null;
}

/** True when the text looks like an http(s) URL (the Tickets search box sends URLs here, everything else to search). */
export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/**
 * Parse an email link, or "#1234" / "1234". Never throws. Hosts are compared case-insensitively; a link to any other
 * host — including another Service Desk environment — is refused, never followed with this build's token.
 */
export function parseTicketLink(input: string): TicketLinkParse {
  const text = input.trim();
  const bare = text.replace(/^#\s*/, '');
  if (NUMBER_RE.test(bare)) {
    const target = targetFromSegment(bare);
    return target ? { ok: true, target } : { ok: false, reason: 'not-a-ticket-link' };
  }

  const match = /^(https?):\/\/([^/?#\s]+)(\/[^?#\s]*)?/i.exec(text);
  if (!match) return { ok: false, reason: 'not-a-ticket-link' };
  const host = (match[2] ?? '').toLowerCase().replace(/:443$/, '');
  const path = match[3] ?? '/';

  const route = /^\/tickets?\/([^/]+)\/?$/i.exec(path);
  if (!route) return { ok: false, reason: 'not-a-ticket-link' };
  if (host !== hostOf(APP_ORIGIN)) return { ok: false, reason: 'other-environment' };

  let target: TicketLinkTarget | null = null;
  try {
    target = targetFromSegment(route[1] ?? '');
  } catch {
    target = null; // malformed %-escape
  }
  return target ? { ok: true, target } : { ok: false, reason: 'not-a-ticket-link' };
}

/**
 * iOS (docs/ios/00-PORT-MANIFEST.md §4.5): where a ticket link tapped in the app opens. The resolver (TicketLink) is
 * registered in every tab's stack, so it opens in the tab on screen, as a link opens in place in Mail — Android switched
 * to the Tickets tab. `focusedTab` is null while a sheet or the sign-in screens are on top: nothing opens under them
 * (the caller leaves the link to the browser, as when signed out). A link that isn't a ticket link here opens nothing.
 */
export function ticketLinkDestination(link: string, focusedTab: AppTab | null): { tab: AppTab; link: string } | null {
  if (focusedTab === null || !parseTicketLink(link).ok) return null;
  return { tab: focusedTab, link };
}
