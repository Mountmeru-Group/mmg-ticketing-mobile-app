// Phase 1 scaffold layout. Since M1 Login was built against A2 it is used ONLY by the __DEV__ token screen, which is
// deleted in Phase 8 together with this file. iOS: the signed-in routes' placeholders are DevPlaceholderScreen instead.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components';
import { useAuthStore } from '@/store/auth.store';
import { ROLE_LABELS } from '@/utils/roles';

export interface PlaceholderAction {
  label: string;
  onPress: () => void;
}

interface PlaceholderScreenProps {
  /** Screen id from 04-SCREEN-MAP.md §2.1, e.g. "M3". */
  screenId: string;
  title: string;
  headerVariant: 'back' | 'close' | 'none';
  headerRight?: ReactNode;
  /** Role visibility, as 04 §2.1 states it. */
  visibility: string;
  /** "ID · METHOD /path" (paths under /api/v1 unless noted). */
  endpoints: readonly string[];
  actions?: readonly PlaceholderAction[];
  children?: ReactNode;
}

export function PlaceholderScreen({
  screenId,
  title,
  headerVariant,
  headerRight,
  visibility,
  endpoints,
  actions = [],
  children,
}: PlaceholderScreenProps) {
  const role = useAuthStore((s) => s.user?.role);
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-gray-50">
      {headerVariant === 'none' ? (
        <View style={{ paddingTop: insets.top }} className="bg-gray-50" />
      ) : (
        <ScreenHeader title={title} variant={headerVariant} right={headerRight} />
      )}
      <ScrollView contentContainerClassName="p-4 pb-12">
        <View className="mb-4 rounded-xl border border-dashed border-blue-300 bg-blue-50 p-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-blue-700">{screenId} · placeholder</Text>
          <Text className="mt-1 text-xl font-bold text-gray-900">{title}</Text>
          <Text className="mt-1 text-xs text-blue-700">Phase 1 scaffold — no data is fetched yet.</Text>
        </View>

        <Section heading="Visible to">
          <Text className="text-sm text-gray-800">{visibility}</Text>
          {role ? <Text className="mt-1 text-xs text-gray-500">Signed in as: {ROLE_LABELS[role]}</Text> : null}
        </Section>

        <Section heading="Endpoints it will call">
          {endpoints.map((endpoint) => (
            <Text key={endpoint} className="font-mono text-xs leading-5 text-gray-800">
              {endpoint}
            </Text>
          ))}
        </Section>

        {children}

        {actions.length > 0 ? (
          <Section heading="Navigate">
            {actions.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                onPress={action.onPress}
                className="mb-2 rounded-lg bg-blue-600 px-4 py-3 active:bg-blue-700"
              >
                <Text className="text-center font-medium text-white">{action.label}</Text>
              </Pressable>
            ))}
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <View className="mb-4 rounded-xl bg-white p-4">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{heading}</Text>
      {children}
    </View>
  );
}
