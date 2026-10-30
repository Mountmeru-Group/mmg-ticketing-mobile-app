// The Home greeting (M2), "Good morning, Ronit". Pure functions; HomeScreen reads the clock when it is shown.
// - Three greetings only. The hour is the DEVICE's local hour (Date#getHours): no server time and no stored profile
//   timezone, because the phone's clock is what the person sees.
// - Bands: morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–04:59. There is no fourth greeting, so the small
//   hours stay "evening": "Good morning" at 2 a.m. reads as wrong to someone still on a late shift.
import { formatDisplayName } from './format';

export type Greeting = 'Good morning' | 'Good afternoon' | 'Good evening';

/** First hour (0–23) of each band. */
export const GREETING_BANDS = { morning: 5, afternoon: 12, evening: 17 } as const;

export function greetingForHour(hour: number): Greeting {
  if (hour >= GREETING_BANDS.morning && hour < GREETING_BANDS.afternoon) return 'Good morning';
  if (hour >= GREETING_BANDS.afternoon && hour < GREETING_BANDS.evening) return 'Good afternoon';
  return 'Good evening';
}

/** The greeting for the device clock now (or for `clock`). */
export function greetingNow(clock: Date = new Date()): Greeting {
  return greetingForHour(clock.getHours());
}

/** The first word of the display name ("Ronit Chaudhari" → "Ronit"), or '' when there is no name. */
export function firstName(displayName: string | null | undefined): string {
  return formatDisplayName(displayName).trim().split(/\s+/)[0] ?? '';
}

/** "Good morning, Ronit", or the greeting alone when there is no name. */
export function greetingLine(greeting: Greeting, displayName: string | null | undefined): string {
  const name = firstName(displayName);
  return name ? `${greeting}, ${name}` : greeting;
}
