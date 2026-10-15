// Side drawer ("Menu", as in SDP), role-aware per 08 §3.2.
// The drawer never lists the three tab destinations, so no screen has two routes.
// - Approvals: ADMIN/AGENT always; END_USER and L2_MANAGER only while APR-1 returns at least one (08 S1), so no one
//   sees an empty module they can't use. Badge = APR-1 count (one cached query, shared with Home and the inbox; it
//   refreshes on pull-to-refresh and after a decision, never polled).
// - Tasks: every role (END_USER read-only). The list is built from TKT-1 rows; see hooks/useTasks.ts (no A20 yet).
// - Sign out: confirmation, AUTH-3, then the local wipe (hooks/useProfile.ts useSignOut).
import Ionicons from '@expo/vector-icons/Ionicons';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_ENV, APP_VERSION } from '@/config/env';
import { countryName, useCountryOptions, usePendingApprovals, useSignOut } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import type { AppDrawerParamList } from '@/types';
import { formatDisplayName, initials } from '@/utils/format';
import { ROLE_LABELS, isAgentOrAdmin, isCountryLockedAgent } from '@/utils/roles';

interface DrawerRow {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: keyof AppDrawerParamList;
  badge?: number;
  onPress: () => void;
}

export function DrawerContent({ navigation, state }: DrawerContentComponentProps) {
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const role = user?.role ?? 'END_USER';
  const activeRoute = state.routes[state.index]?.name;

  const approvals = usePendingApprovals();
  const pendingApprovals = approvals.data?.length ?? 0;
  // 08 S1: ADMIN/AGENT always; END_USER and L2_MANAGER only while they have ≥ 1 pending approval.
  const showApprovals = isAgentOrAdmin(role) || pendingApprovals >= 1;
  const { signOut, signingOut } = useSignOut();
  const locked = !!user && isCountryLockedAgent(user);
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

  const modules: DrawerRow[] = [];
  if (showApprovals) {
    modules.push({
      key: 'approvals',
      label: 'Approvals',
      icon: 'checkmark-done-outline',
      route: 'Approvals',
      badge: pendingApprovals,
      onPress: go('Approvals'),
    });
  }
  modules.push(
    { key: 'tasks', label: 'Tasks', icon: 'checkbox-outline', route: 'Tasks', onPress: go('Tasks') },
    { key: 'kb', label: 'Knowledge base', icon: 'book-outline', route: 'Knowledge', onPress: go('Knowledge') },
    { key: 'ann', label: 'Announcements', icon: 'megaphone-outline', route: 'Announcements', onPress: go('Announcements') },
  );
  // Hidden until their asks ship: Service catalog (P2), Assets (P18). No approval delegation (A26).

  const account: DrawerRow[] = [
    { key: 'settings', label: 'Settings', icon: 'settings-outline', route: 'Profile', onPress: go('Profile') },
    {
      key: 'signout',
      label: signingOut ? 'Signing out…' : 'Sign out',
      icon: 'log-out-outline',
      onPress: () => {
        if (!signingOut) void signOut();
      },
    },
  ];

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile and settings"
          onPress={go('Profile')}
          className="flex-row items-center border-b border-gray-200 px-4 py-5"
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-blue-600">
            <Text className="text-base font-bold text-white">{initials(user?.displayName)}</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
              {formatDisplayName(user?.displayName) || 'Signed in'}
            </Text>
            <Text className="text-sm text-gray-500">{ROLE_LABELS[role]}</Text>
            {locked ? (
              <View className="mt-1 flex-row items-center self-start rounded-full bg-gray-100 px-2 py-0.5">
                <Ionicons name="lock-closed" size={10} color="#374151" />
                <Text className="ml-1 text-xs text-gray-700">{lockedCountry ?? 'Country locked'}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>

        <View className="py-2">
          {modules.map((row) => (
            <Row key={row.key} row={row} active={row.route === activeRoute} />
          ))}
        </View>
        <View className="mx-4 border-t border-gray-200" />
        <View className="py-2">
          {account.map((row) => (
            <Row key={row.key} row={row} active={row.route === activeRoute} />
          ))}
          {signingOut ? <ActivityIndicator style={{ marginTop: 4 }} color="#2563eb" /> : null}
        </View>
      </ScrollView>
      <Text className="px-4 py-3 text-xs text-gray-400">
        v{APP_VERSION} · {APP_ENV}
        {__DEV__ ? ' · dev build' : ''}
      </Text>
    </View>
  );
}

function Row({ row, active }: { row: DrawerRow; active: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={row.onPress}
      className={`mx-2 flex-row items-center rounded-lg px-3 py-3 ${active ? 'bg-blue-50' : ''}`}
    >
      <Ionicons name={row.icon} size={22} color={active ? '#2563eb' : '#374151'} />
      <Text className={`ml-4 flex-1 text-base ${active ? 'font-semibold text-blue-700' : 'text-gray-800'}`}>{row.label}</Text>
      {row.badge ? (
        <View className="min-w-6 items-center rounded-full bg-red-600 px-1.5 py-0.5">
          <Text className="text-xs font-bold text-white">{row.badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
