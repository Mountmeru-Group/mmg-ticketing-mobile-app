// Shadows. iOS draws a view's shadow from four style props: shadowColor, shadowOffset, shadowOpacity and shadowRadius.
// Android drew the floating button's shadow from NativeWind's `shadow-lg` (elevation); here the four values are set
// explicitly, so the shadow does not depend on how a class is translated. Colours come from the palette.
import { palette } from './colors';

export const shadows = {
  /** The floating "+" (create ticket) button: Tailwind's shadow-lg as one iOS shadow. */
  fab: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
} as const;
