// The environment chip (2026-11-18): PRODUCTION in brand red on its light tint, UAT in amber on its light tint
// (colors.environment, src/theme/colors.ts; told apart by lightness, both WCAG AA). Used by the drawer's Environment row
// and its header's UAT chip, and, with another word ("IN USE", "TESTING"), by the switch sheet's rows.
import { Text, View } from 'react-native';

import { ENVIRONMENT_CHIP_LABELS, type AppEnvironment } from '@/config/env';
import { colors } from '@/theme';

/** `label` replaces the environment's own word, in the same colours. Decorative to TalkBack: the row says it. */
export function EnvironmentChip({ env, label }: { env: AppEnvironment; label?: string }) {
  const tone = colors.environment[env];
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      className="rounded-full px-2 py-0.5"
      style={{ backgroundColor: tone.bg }}
    >
      <Text className="text-[11px] font-bold tracking-wide" style={{ color: tone.fg }}>
        {label ?? ENVIRONMENT_CHIP_LABELS[env]}
      </Text>
    </View>
  );
}
