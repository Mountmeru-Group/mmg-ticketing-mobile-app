// The More tab (docs/ios/00-PORT-MANIFEST.md §4.5): Android's drawer as an iOS grouped list. Which rows show is decided
// by moreSections() (utils/permissions.ts, pinned per role by tests/navigation); this file only lays them out.
// - A row pushes its module inside the More stack, so the module's first screen swipes back here.
// - Approvals is a row only for END_USER and L2_MANAGER while APR-1 returns ≥ 1; ADMIN and AGENT have the tab.
//   Badge = the APR-1 count: one cached query, shared with the tab bar, Home and the inbox. Never polled.
// - At the bottom, as the drawer and the web's user block: the account card (avatar, name, role, and the locked country
//   chip; it opens Profile & settings) and Sign out (confirmation, AUTH-3, then the local wipe: useSignOut).
// - Footer: version and environment.
// - iOS-4: the separators are the cards' border colour (gray-100 was barely visible on white), the row icons grow with
//   the text size (HIG Typography: "Increase the size of meaningful interface icons"), and every row has a label.
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { APP_ENV, APP_VERSION } from '@/config/env';
import { countryName, useCountryOptions, usePendingApprovals, useScaledIconSize, useSignOut } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette } from '@/theme';
import type { MoreStackScreenProps } from '@/types';
import { formatDisplayName, initials } from '@/utils/format';
import { moreSections, type MoreItem } from '@/utils/permissions';
import { ROLE_LABELS } from '@/utils/roles';
import { countrySelectorMode } from '@/utils/ticket-filters';

/** Label and icon of each row; which rows show is decided by moreSections() alone. */
const ROWS: Record<MoreItem, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  approvals: { label: 'Approvals', icon: 'checkmark-done-outline' },
  tasks: { label: 'Tasks', icon: 'checkbox-outline' },
  // The web sidebar's label (AppLayout.tsx:30). Phase G4.
  catalog: { label: 'Service Request', icon: 'clipboard-outline' },
  // The catalogue's second view, a row of its own on iOS.
  myRequests: { label: 'My Requests', icon: 'documents-outline' },
  knowledge: { label: 'Knowledge base', icon: 'book-outline' },
  announcements: { label: 'Announcements', icon: 'megaphone-outline' },
  settings: { label: 'Settings', icon: 'settings-outline' },
};

export function MoreScreen({ navigation }: MoreStackScreenProps<'More'>) {
  const user = useAuthStore((s) => s.user);
  const pendingApprovals = usePendingApprovals().data?.length ?? 0;
  const { signOut, signingOut } = useSignOut();
  const locked = !!user && countrySelectorMode(user) === 'locked';
  const countries = useCountryOptions({ enabled: locked });
  const lockedCountry = locked ? countryName(countries.data?.find((c) => c.id === user?.countryId)) : null;

  const open = (item: MoreItem) => {
    switch (item) {
      case 'approvals':
        return navigation.navigate('ApprovalsInbox');
      case 'tasks':
        return navigation.navigate('TaskList');
      case 'catalog':
        return navigation.navigate('ServiceCatalog', { view: 'catalog' });
      case 'myRequests':
        return navigation.navigate('ServiceCatalog', { view: 'requests' });
      case 'knowledge':
        return navigation.navigate('KnowledgeBase');
      case 'announcements':
        return navigation.navigate('Announcements');
      case 'settings':
        return navigation.navigate('Profile');
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-gray-50" contentContainerClassName="px-4 pb-8 pt-2">
      {moreSections(user?.role, pendingApprovals).map((section) => (
        <Group key={section.key}>
          {section.items.map((item, i) => (
            <Row
              key={item}
              label={ROWS[item].label}
              icon={ROWS[item].icon}
              badge={item === 'approvals' ? pendingApprovals : 0}
              divider={i > 0}
              onPress={() => open(item)}
            />
          ))}
        </Group>
      ))}

      <Group>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile and settings"
          onPress={() => navigation.navigate('Profile')}
          className="min-h-11 flex-row items-center px-4 py-3 active:bg-gray-100"
        >
          <View
            className="h-10 w-10 items-center justify-center rounded-full bg-primary/10"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text className="text-sm font-bold text-primary" maxFontSizeMultiplier={1.4}>{initials(user?.displayName)}</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
              {formatDisplayName(user?.displayName) || 'Signed in'}
            </Text>
            {user ? <Text className="text-sm text-gray-500">{ROLE_LABELS[user.role]}</Text> : null}
            {locked ? (
              <View className="mt-1 flex-row items-center self-start rounded-full bg-gray-100 px-2.5 py-0.5">
                <Ionicons name="lock-closed" size={12} color={colors.text.body} />
                <Text className="ml-1 text-xs text-gray-700">{lockedCountry ?? 'Country locked'}</Text>
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
        </Pressable>
        <View className="ml-4 border-t border-border" />
        {/* Web: the user menu's Sign out, `text-red-600`. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={signingOut ? 'Signing out' : 'Sign out'}
          accessibilityState={{ busy: signingOut }}
          onPress={() => {
            if (!signingOut) void signOut();
          }}
          className="min-h-11 flex-row items-center px-4 py-3 active:bg-red-50"
        >
          <View className="h-6 w-6 items-center justify-center">
            {signingOut ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="log-out-outline" size={22} color={palette.red[600]} />
            )}
          </View>
          <Text className="ml-3 flex-1 text-base font-medium text-red-600">{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>
      </Group>

      <Text className="px-4 text-xs text-gray-500">
        v{APP_VERSION} · {APP_ENV}
        {__DEV__ ? ' · dev build' : ''}
      </Text>
    </ScrollView>
  );
}

/** One iOS list section: a white rounded group on the grey page. */
function Group({ children }: { children: ReactNode }) {
  return <View className="mb-6 overflow-hidden rounded-xl bg-white">{children}</View>;
}

interface RowProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge: number;
  divider: boolean;
  onPress: () => void;
}

function Row({ label, icon, badge, divider, onPress }: RowProps) {
  const iconSize = useScaledIconSize(22);
  return (
    <View>
      {divider ? <View className="ml-14 border-t border-border" /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={badge > 0 ? `${label}, ${badge} waiting` : label}
        onPress={onPress}
        className="min-h-11 flex-row items-center px-4 py-3 active:bg-gray-100"
      >
        <Ionicons name={icon} size={iconSize} color={colors.primary} />
        <Text className="ml-4 flex-1 text-base text-gray-900">{label}</Text>
        {badge > 0 ? (
          <View className="mr-2 min-w-6 items-center rounded-full bg-red-600 px-1.5 py-0.5">
            <Text className="text-xs font-bold text-white" maxFontSizeMultiplier={1.4}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
      </Pressable>
    </View>
  );
}
