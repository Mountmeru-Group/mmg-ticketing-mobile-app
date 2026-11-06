// The people row on a ticket card (2026-11-03, docs/brand/UI-STANDARDS.md §14): [RJ] Rohit Jadhav → [SD] Sarthak D.
// - 25 dp avatars with initials. The requester has S3's avatar (pale brand red), the technician slate-700: they differ
//   in lightness, not hue alone (colors.avatar), and each name is written beside its avatar.
// - The arrow is a static glyph. Nothing here animates: it is part of a list row (docs/PERFORMANCE.md §13).
// - Unassigned: a dashed empty ring with a plus, and "Unassigned" in italic.
// - Always one line: each name truncates, so the row never wraps. At 100 % text it is exactly the avatar's 25 dp tall.
// - END_USER sees the technician only: the requester is themselves.
// Names go through formatDisplayName(), as the drawer's do, so an e-mail-style name reads as a name.
//
// iOS (iOS-5f): hidden from VoiceOver as from TalkBack (`accessibilityElementsHidden`; `importantForAccessibility` is
// Android's): the card's own label says who raised it and who has it (utils/format.ts peopleRowLabel). Dynamic Type:
// the names grow with the text size and stay on one line, truncated; the row grows with them. The initials stop at
// ×1.2, so two letters still fit the 25 pt circle; the name beside them carries the meaning.
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, type BadgeTone } from '@/theme';
import { formatDisplayName, initials, shortName } from '@/utils/format';

/** Avatar diameter, dp. */
const AVATAR = 25;
/**
 * The initials grow with the system text size up to this, so two letters still fit the 25 dp circle at 200 % text.
 * They repeat the name written beside them, which grows without limit.
 */
const INITIALS_MAX_SCALE = 1.2;

interface PeopleRowProps {
  requesterName: string | null | undefined;
  technicianName: string | null | undefined;
  /** Staff see requester → technician; END_USER the technician alone. */
  showRequester: boolean;
  /** On a tinted (selected) card: muted text one shade darker, as the card's other meta text. */
  onTint?: boolean;
}

function Avatar({ name, tone }: { name: string | null | undefined; tone: BadgeTone }) {
  return (
    <View style={[styles.avatar, { backgroundColor: tone.bg }]}>
      <Text className="text-xs font-semibold" style={{ color: tone.fg }} maxFontSizeMultiplier={INITIALS_MAX_SCALE}>
        {initials(name)}
      </Text>
    </View>
  );
}

function Person({ avatarName, label, tone }: { avatarName: string | null | undefined; label: string; tone: BadgeTone }) {
  return (
    <View className="shrink flex-row items-center">
      <Avatar name={avatarName} tone={tone} />
      <Text className="ml-1.5 shrink text-xs font-medium text-gray-700" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Unassigned({ onTint }: { onTint: boolean }) {
  return (
    <View className="shrink flex-row items-center">
      <View style={[styles.avatar, styles.empty]}>
        <Ionicons name="add" size={14} color={colors.avatar.unassigned} />
      </View>
      <Text className={`ml-1.5 shrink text-xs italic ${onTint ? 'text-gray-600' : 'text-gray-500'}`} numberOfLines={1}>
        Unassigned
      </Text>
    </View>
  );
}

export function PeopleRow({ requesterName, technicianName, showRequester, onTint = false }: PeopleRowProps) {
  const technician = formatDisplayName(technicianName);
  return (
    <View className="flex-row items-center" style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {showRequester ? (
        <>
          <Person
            avatarName={requesterName}
            label={formatDisplayName(requesterName) || 'Unknown requester'}
            tone={colors.avatar.requester}
          />
          <Ionicons name="arrow-forward" size={14} color={colors.text.muted} style={styles.arrow} />
        </>
      ) : null}
      {technician ? (
        <Person avatarName={technicianName} label={shortName(technicianName)} tone={colors.avatar.technician} />
      ) : (
        <Unassigned onTint={onTint} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: AVATAR },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.avatar.unassigned },
  arrow: { marginHorizontal: 8 },
});
