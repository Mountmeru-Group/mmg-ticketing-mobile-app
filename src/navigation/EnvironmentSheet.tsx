// The environment switch sheet (2026-11-17), opened by the drawer's "Service Desk environment" row beside Sign out
// (./DrawerContent.tsx), for every role in a release build (CAN_SWITCH_ENVIRONMENT, src/config/env.ts), and only after
// a correct switch password (./EnvironmentPasswordSheet.tsx). It gets that entry's single-use pass and hands it to
// switchEnvironment(), which refuses to leave Production without one. Login has no switch.
// - Lists Production and UAT with their host names. The one in use says so; Production carries the DEFAULT badge.
// - "Switch and sign out" runs switchEnvironment() (src/api/environmentSwitch.ts): push token off the current
//   environment, sign-out, the whole query cache and the filter state cleared, then the new environment stored. Login
//   then shows on the new environment, where any role may sign in.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { switchEnvironment } from '@/api/environmentSwitch';
import { Sheet, SubmitButton } from '@/components';
import {
  DEFAULT_ENVIRONMENT, ENVIRONMENT_NAMES, SELECTABLE_ENVIRONMENTS, apiHostFor, type AppEnvironment,
} from '@/config/env';
import { useSingleFlight } from '@/hooks';
import { useEnvironmentStore } from '@/store/environment.store';
import type { SwitchPass } from '@/utils/switch-password';

export const SWITCH_LABEL = 'Switch and sign out';

export function EnvironmentSheet({
  visible, pass, onClose, onSwitched,
}: {
  visible: boolean;
  /** From a correct switch password, good for one switch (utils/switch-password.ts). */
  pass: SwitchPass | null;
  onClose: () => void;
  onSwitched?: () => void;
}) {
  const active = useEnvironmentStore((s) => s.environment);
  const [chosen, setChosen] = useState<AppEnvironment>(active);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const once = useSingleFlight();

  // Each time it opens: the environment in use is selected, and no old error.
  useEffect(() => {
    if (!visible) return;
    setChosen(active);
    setError(null);
  }, [visible, active]);

  const close = () => {
    if (!switching) onClose();
  };

  const apply = () =>
    void once(async () => {
      setSwitching(true);
      setError(null);
      try {
        await switchEnvironment(chosen, pass);
        onSwitched?.();
        onClose();
      } catch {
        // The pass is used up by then: another try needs the password again.
        setError("Couldn't switch. Close this and enter the password again.");
      } finally {
        setSwitching(false);
      }
    });

  return (
    <Sheet visible={visible} title="Service Desk environment" onClose={close}>
      <Text className="mx-4 mb-3 text-sm text-gray-600">
        Choose which Service Desk Setu connects to. Switching signs you out and clears everything Setu has loaded.
      </Text>
      <View accessibilityRole="radiogroup">
        {SELECTABLE_ENVIRONMENTS.map((env) => (
          <EnvironmentRow
            key={env}
            env={env}
            chosen={env === chosen}
            inUse={env === active}
            disabled={switching}
            onPress={() => setChosen(env)}
          />
        ))}
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="mx-4 mt-3 text-sm text-red-700">
          {error}
        </Text>
      ) : null}
      <View className="mx-4 mt-4">
        <SubmitButton label={SWITCH_LABEL} onPress={apply} disabled={chosen === active} loading={switching} />
      </View>
    </Sheet>
  );
}

function EnvironmentRow({
  env, chosen, inUse, disabled, onPress,
}: {
  env: AppEnvironment;
  chosen: boolean;
  inUse: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const host = apiHostFor(env);
  const isDefault = env === DEFAULT_ENVIRONMENT;
  const spoken = [ENVIRONMENT_NAMES[env], host, isDefault ? 'default' : null, inUse ? 'in use' : null].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={spoken}
      accessibilityState={{ selected: chosen, disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-14 flex-row items-center border-b border-gray-100 px-4 py-3 active:bg-gray-50"
    >
      <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${chosen ? 'border-primary' : 'border-gray-400'}`}>
        {chosen ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
      </View>
      <View className="ml-3 flex-1">
        <View className="flex-row flex-wrap items-center">
          <Text className="text-base font-medium text-gray-900">{ENVIRONMENT_NAMES[env]}</Text>
          {isDefault ? <Badge label="DEFAULT" tone="neutral" /> : null}
          {inUse ? <Badge label="IN USE" tone="active" /> : null}
        </View>
        <Text className="text-xs text-gray-600">{host}</Text>
      </View>
    </Pressable>
  );
}

function Badge({ label, tone }: { label: string; tone: 'neutral' | 'active' }) {
  return (
    <View className={`ml-2 rounded px-1.5 py-0.5 ${tone === 'active' ? 'bg-green-50' : 'bg-gray-100'}`}>
      <Text className={`text-[10px] font-semibold tracking-wide ${tone === 'active' ? 'text-green-800' : 'text-gray-700'}`}>{label}</Text>
    </View>
  );
}
