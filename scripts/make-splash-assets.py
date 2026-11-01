# Draws the two start-up images from assets/brand/meru-mark.png (docs/RELEASE.md §7, docs/PERFORMANCE.md §12).
# Run from the repo root: python scripts/make-splash-assets.py   (needs Pillow; nothing else, no network).
#
# - assets/brand/meru-drop.png: the mark with everything but the yellow drop cleared. Same 566 x 346 canvas as the
#   mark, so the start-up intro (src/navigation/SplashIntro.tsx) draws both in one box and they line up exactly.
# - assets/splash-icon.png: the native splash (expo-splash-screen, app.json `imageWidth` 192). Only the drop, raised by
#   the intro's fall: it is the intro's first frame, so the hand-off from the native splash shows no change.
#
# The numbers below must match src/theme/brand.ts (`splashArt`) and src/theme/motion.ts (`intro.dropDistance`).
# tests/motion/start-up-and-login.test.mjs reads both images and fails if they drift.
from PIL import Image

MARK = 'assets/brand/meru-mark.png'
DROP_OUT = 'assets/brand/meru-drop.png'
SPLASH_OUT = 'assets/splash-icon.png'

IMAGE_PX = 1024     # splash image size; app.json imageWidth 192 dp, so 1 dp = 1024 / 192 px
IMAGE_DP = 192
LOGO_LEFT_PX = 192  # where the logo ends the intro, in the splash image (Phase C's 640 px width, 120 dp)
LOGO_TOP_PX = 160
LOGO_WIDTH_PX = 640
DROP_DISTANCE_DP = 18  # motion.intro.dropDistance

mark = Image.open(MARK).convert('RGBA')
W, H = mark.size
px = mark.load()

# The drop is its own connected shape (8-connected, alpha > 0); the "m" and "meru" are others. Seed it from the
# yellowest opaque pixel so the choice does not depend on scan order.
seed = max(((x, y) for y in range(H) for x in range(W) if px[x, y][3] > 0),
           key=lambda p: px[p][0] + px[p][1] - 2 * px[p][2])
drop_pixels = {seed}
stack = [seed]
while stack:
    x, y = stack.pop()
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            n = (x + dx, y + dy)
            if 0 <= n[0] < W and 0 <= n[1] < H and n not in drop_pixels and px[n][3] > 0:
                drop_pixels.add(n)
                stack.append(n)

drop = Image.new('RGBA', (W, H), (0, 0, 0, 0))
dpx = drop.load()
for p in drop_pixels:
    dpx[p] = px[p]
drop.save(DROP_OUT, optimize=True)

rise_px = round(DROP_DISTANCE_DP * IMAGE_PX / IMAGE_DP)
logo_height_px = round(H * LOGO_WIDTH_PX / W)
scaled = drop.resize((LOGO_WIDTH_PX, logo_height_px), Image.LANCZOS)
splash = Image.new('RGBA', (IMAGE_PX, IMAGE_PX), (0, 0, 0, 0))
splash.alpha_composite(scaled, (LOGO_LEFT_PX, LOGO_TOP_PX - rise_px))
splash.save(SPLASH_OUT, optimize=True)

print(f'{DROP_OUT}: {W}x{H}, drop {len(drop_pixels)} px, bbox {drop.getbbox()}')
print(f'{SPLASH_OUT}: {IMAGE_PX}x{IMAGE_PX}, drop raised {rise_px} px, bbox {splash.getbbox()}')
