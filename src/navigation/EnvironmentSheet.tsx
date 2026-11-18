// The environment switch sheet, opened by the drawer's "Environment" row (./DrawerContent.tsx). ADMIN only since
// 2026-11-18 (permissions.ts canSwitchEnvironment): the drawer mounts this sheet only for a person who may switch, in a
// release build (CAN_SWITCH_ENVIRONMENT, src/config/env.ts). No password: the gate of 2026-11-17 is removed. It is not a
// route, so no link, back history or saved navigation state can open it. Login has no switch.
// Layout as approved (UI-STANDARDS.md §18):
// - The heading "Environment", and nothing else above the options.
// - Two rows, one line each: a radio, the name, and a state chip on the right (IN USE on the one in use, TESTING on UAT
//   otherwise), in that environment's colours. No host names, no captions.
// - One line at the foot: switching signs you out and clears everything loaded. Then "Switch and sign out" and Cancel.
// "Switch and sign out" runs switchEnvironment() (src/api/environmentSwitch.ts), unchanged: the device token off the
// environment being left, sign-out, the whole query cache and the filter and period state cleared, then the new
// environment stored. Login then shows on the new environment.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { switchEnvironment } from '@/api/environmentSwitch';
import { OutlineButton, Sheet, SubmitButton } from '@/components';
import { ENVIRONMENT_NAMES, SELECTABLE_ENVIRONMENTS, environmentRowState, type AppEnvironment } from '@/config/env';
import { useSingleFlight } from '@/hooks';
import { useEnvironmentStore } from '@/store/environment.store';
import { EnvironmentChip } from './EnvironmentChip';

export const SWITCH_LABEL = 'Switch and sign out';
export const SWITCH_FOOTNOTE = 'Switching signs you out and clears everything loaded.';

export function EnvironmentSheet({
  visible, onClose, onSwitched,
}: {
  visible: boolean;
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
        await switchEnvironment(chosen);
        onSwitched?.();
        onClose();
      } catch {
        setError("Couldn't switch. Try again.");
      } finally {
        setSwitching(false);
      }
    });

  return (
    <Sheet visible={visible} title="Environment" onClose={close}>
      <View accessibilityRole="radiogroup">
        {SELECTABLE_ENVIRONMENTS.map((env) => (
          <EnvironmentRow
            key={env}
            env={env}
            chosen={env === chosen}
            state={environmentRowState(env, active)}
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
      <Text className="mx-4 mt-3 text-sm text-gray-600">{SWITCH_FOOTNOTE}</Text>
      <View className="mx-4 mt-3">
        <SubmitButton label={SWITCH_LABEL} onPress={apply} disabled={chosen === active} loading={switching} />
      </View>
      <View className="mx-4 mt-2">
        <OutlineButton label="Cancel" onPress={close} disabled={switching} />
      </View>
    </Sheet>
  );
}

function EnvironmentRow({
  env, chosen, state, disabled, onPress,
}: {
  env: AppEnvironment;
  chosen: boolean;
  state: 'IN USE' | 'TESTING' | null;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={state ? `${ENVIRONMENT_NAMES[env]}, ${state.toLowerCase()}` : ENVIRONMENT_NAMES[env]}
      accessibilityState={{ selected: chosen, disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-14 flex-row items-center border-b border-gray-100 px-4 py-3 active:bg-gray-50"
    >
      <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${chosen ? 'border-primary' : 'border-gray-400'}`}>
        {chosen ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
      </View>
      <Text className="ml-3 flex-1 text-base font-medium text-gray-900" numberOfLines={1}>
        {ENVIRONMENT_NAMES[env]}
      </Text>
      {state ? <EnvironmentChip env={env} label={state} /> : null}
    </Pressable>
  );
}
