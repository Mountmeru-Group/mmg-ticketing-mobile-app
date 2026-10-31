// The Mount Meru mark (drop + "m" + "meru"), as on the web portal's login card and sidebar.
// assets/brand/meru-mark.png is assets/brand/meru-logo.png trimmed to the logo and made transparent (566 × 346), so
// it sits on any background. Height sets the size; the width follows the logo's own aspect ratio.
// Both dimensions are set explicitly. React Native's <Image> gave a bundled asset its intrinsic size (566 × 346 dp)
// as a default style, so a height-only style kept the 566 dp width, and in a row Yoga then derived the height from
// that width through `aspectRatio`: the drawer showed the logo at 566 × 346 dp instead of 65 × 40.
// expo-image (Phase P2) decodes the mark at the size shown.
// `width` (optional) gives a box of its own instead: the mark is contained in it, centred (Login's logo card).
import { Image } from 'expo-image';

const MARK = require('../../assets/brand/meru-mark.png') as number;
const MARK_ASPECT_RATIO = 566 / 346;

export function BrandLogo({ height, width }: { height: number; width?: number }) {
  return (
    <Image
      source={MARK}
      contentFit="contain"
      style={{ height, width: width ?? Math.round(height * MARK_ASPECT_RATIO) }}
      accessibilityRole="image"
      accessibilityLabel="Mount Meru"
    />
  );
}
