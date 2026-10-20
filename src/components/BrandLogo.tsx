// The Mount Meru mark (drop + "m" + "meru"), as on the web portal's login card and sidebar.
// assets/brand/meru-mark.png is assets/brand/meru-logo.png trimmed to the logo and made transparent (566 × 346), so
// it sits on any background. Height sets the size; the width follows the logo's own aspect ratio.
import { Image } from 'react-native';

const MARK = require('../../assets/brand/meru-mark.png') as number;
const MARK_ASPECT_RATIO = 566 / 346;

export function BrandLogo({ height }: { height: number }) {
  return (
    <Image
      source={MARK}
      resizeMode="contain"
      style={{ height, aspectRatio: MARK_ASPECT_RATIO }}
      accessibilityRole="image"
      accessibilityLabel="Mount Meru"
    />
  );
}
