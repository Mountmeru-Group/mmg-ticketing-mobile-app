// The Login footer's copyright line (2026-11-04): "Copyright © <year> Mount Meru Group". Pure functions; LoginScreen
// reads the clock when it is shown.
// - The year is the DEVICE's local calendar year (Date#getFullYear), never written into the source: a written year is
//   wrong from 1 January. tests/login/copyright-year.test.mjs fails if any user-facing string in src/ holds one.
// - Read on first render, on focus and on return to the foreground, as the Home greeting is (UI-STANDARDS.md §9).
//   Never on a timer.

export const COPYRIGHT_HOLDER = 'Mount Meru Group';

/** The calendar year on the device clock now (or on `clock`). */
export function copyrightYear(clock: Date = new Date()): number {
  return clock.getFullYear();
}

/** "Copyright © 2027 Mount Meru Group" for 2027. */
export function copyrightLine(year: number): string {
  return `Copyright © ${year} ${COPYRIGHT_HOLDER}`;
}

/**
 * What TalkBack reads (VoiceOver too, on iOS): it says "©" as "copyright", so the line itself would be read as
 * "copyright copyright …".
 */
export function copyrightLabel(year: number): string {
  return `Copyright ${year} ${COPYRIGHT_HOLDER}`;
}
