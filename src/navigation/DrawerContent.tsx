// Side drawer ("Menu", as in SDP), role-aware per 08 §3.2. Which rows show is decided by drawerItems()
// (utils/permissions.ts, pinned per role by tests/rbac); this file only lays them out.
// The drawer never lists the three tab destinations, so no screen has two routes.
// - Approvals: ADMIN/AGENT always; END_USER and L2_MANAGER only while APR-1 returns at least one (08 S1), so no one
//   sees an empty module they can't use. Badge = APR-1 count (one cached query, shared with Home and the inbox; it
//   refreshes on pull-to-refresh and after a decision, never polled).
// - Tasks: every role (END_USER read-only). The list is built from TKT-1 rows; see hooks/useTasks.ts (no A20 yet).
// - Sign out: confirmation, AUTH-3, then the local wipe (hooks/useProfile.ts useSignOut).
// - Layout follows the web sidebar (frontend/src/layouts/AppLayout.tsx), top to bottom:
//   - a white header band with the logo (44 dp tall, 72 dp wide) and the app name beside it;
//   - the nav rows, which scroll when they overflow: the current module as a filled brand-red row, idle rows in the
//     web's idle grey;
//   - a separator, then the account card pinned to the bottom (the web's user block under `border-t`): avatar, name
//     and role open the profile; Sign out sits inside the card in the web's red (the web opens it from that block);
//   - the version line, above the bottom inset.
import Ionicons from '@expo/vector-icons/Ionicons';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components';
import { APP_ENV, APP_VERSION } from '@/config/env';
import { countryName, useCountryOptions, usePendingApprovals, useSignOut } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette } from '@/theme';
import type { AppDrawerParamList } from '@/types';
import { formatDisplayName, initials } from '@/utils/format';
import { drawerItems, type DrawerItem } from '@/utils/permissions';
import { ROLE_LABELS } from '@/utils/roles';
import { countrySelectorMode } from '@/utils/ticket-filters';

interface DrawerRow {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: keyof AppDrawerParamList;
  badge?: number;
  onPress: () => void;
}

/** Label, icon and destination of each drawer row; which rows show is decided by drawerItems() alone. */
const DRAWER_ROWS: Record<DrawerItem, { label: string; icon: keyof typeof Ionicons.glyphMap; route: keyof AppDrawerParamList }> = {
  approvals: { label: 'Approvals', icon: 'checkmark-done-outline', route: 'Approvals' },
  tasks: { label: 'Tasks', icon: 'checkbox-outline', route: 'Tasks' },
  knowledge: { label: 'Knowledge base', icon: 'book-outline', route: 'Knowledge' },
  announcements: { label: 'Announcements', icon: 'megaphone-outline', route: 'Announcements' },
  settings: { label: 'Settings', icon: 'settings-outline', route: 'Profile' },
};

export function DrawerContent({ navigation, state }: DrawerContentComponentProps) {
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const role = user?.role ?? 'END_USER';
  const activeRoute = state.routes[state.index]?.name;

  const approvals = usePendingApprovals();
  const pendingApprovals = approvals.data?.length ?? 0;
  const { signOut, signingOut } = useSignOut();
  const locked = !!user && countrySelectorMode(user) === 'locked';
  const countries = useCountryOptions({ enabled: locked });
  const lockedCountry = locked ? countryName(countries.data?.find((c) => c.id === user?.countryId)) : null;

  // `pop: true`: return to the module's root if it is already in the stack, instead of stacking another copy (v7).
  const go = (route: keyof AppDrawerParamList) => () => {
    switch (route) {
      case 'Approvals':
        navigation.navigate('Approvals', { screen: 'ApprovalsInbox', pop: true });
        break;
      case 'Tasks':
        navigation.navigate('Tasks', { screen: 'TaskList', pop: true });
        break;
      case 'Knowledge':
        navigation.navigate('Knowledge', { screen: 'KnowledgeBase', pop: true });
        break;
      case 'MainTabs':
        navigation.navigate('MainTabs', { screen: 'HomeTab' });
        break;
      default:
        navigation.navigate(route);
    }
  };

  const rows: DrawerRow[] = drawerItems(role, pendingApprovals).map((item) => ({
    key: item,
    ...DRAWER_ROWS[item],
    badge: item === 'approvals' ? pendingApprovals : undefined,
    onPress: go(DRAWER_ROWS[item].route),
  }));
  // Hidden until their asks ship: Service catalog (P2), Assets (P18). No approval delegation (A26).

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Header band: logo left, vertically centred, at a fixed 44 dp; the app name beside it. */}
      <View className="h-[72px] flex-row items-center border-b border-border bg-white px-4">
        <BrandLogo height={44} />
        <View className="ml-3 flex-1" accessibilityRole="header" accessibilityLabel="Mount Meru Service Desk">
          <Text className="text-sm font-bold leading-5 text-gray-900" numberOfLines={1}>Mount Meru</Text>
          <Text className="text-sm font-bold leading-5 text-gray-900" numberOfLines={1}>Service Desk</Text>
        </View>
      </View>

      {/* Only the rows scroll, so the account card stays pinned to the bottom however many rows there are. */}
      <ScrollView className="flex-1">
        <View className="py-2">
          {rows.map((row) => (
            <Row key={row.key} row={row} active={row.route === activeRoute} />
          ))}
        </View>
      </ScrollView>

      <View className="border-t border-border px-2 pt-2">
        <View className="overflow-hidden rounded-xl border border-border">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile and settings"
            onPress={go('Profile')}
            className="flex-row items-center px-3 py-3 active:bg-gray-50"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Text className="text-sm font-bold text-primary">{initials(user?.displayName)}</Text>
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
                {formatDisplayName(user?.displayName) || 'Signed in'}
              </Text>
              <Text className="text-sm text-gray-500">{ROLE_LABELS[role]}</Text>
              {locked ? (
                <View className="mt-1 flex-row items-center self-start rounded-full bg-gray-100 px-2.5 py-0.5">
                  <Ionicons name="lock-closed" size={12} color={colors.text.body} />
                  <Text className="ml-1 text-xs text-gray-700">{lockedCountry ?? 'Country locked'}</Text>
                </View>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
          </Pressable>
          <View className="mx-3 border-t border-gray-100" />
          {/* Web: the user menu's Sign out, `text-red-600 hover:bg-red-50`. */}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: signingOut }}
            onPress={() => {
              if (!signingOut) void signOut();
            }}
            className="min-h-12 flex-row items-center px-3 active:bg-red-50"
          >
            <View className="h-6 w-6 items-center justify-center">
              {signingOut ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="log-out-outline" size={24} color={palette.red[600]} />
              )}
            </View>
            <Text className="ml-4 flex-1 text-base font-medium text-red-600">
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
      </View>
      <Text className="px-4 py-3 text-xs text-gray-500">
        v{APP_VERSION} · {APP_ENV}
        {__DEV__ ? ' · dev build' : ''}
      </Text>
    </View>
  );
}

function Row({ row, active }: { row: DrawerRow; active: boolean }) {
  // Web sidebar: active `bg-primary text-white`, idle `text-gray-600`.
  const fg = active ? colors.nav.activeFg : colors.nav.idleFg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={row.onPress}
      className={`mx-2 min-h-12 flex-row items-center rounded-lg px-3 ${active ? 'bg-primary' : 'active:bg-gray-100'}`}
    >
      <Ionicons name={row.icon} size={24} color={fg} />
      <Text className="ml-4 flex-1 text-base" style={{ color: fg, fontWeight: active ? '600' : '500' }}>
        {row.label}
      </Text>
      {/* Inverted on the active row, where a red count would vanish into the red background. */}
      {row.badge ? (
        <View className={`min-w-6 items-center rounded-full px-1.5 py-0.5 ${active ? 'bg-white' : 'bg-red-600'}`}>
          <Text className={`text-xs font-bold ${active ? 'text-primary' : 'text-white'}`}>{row.badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
