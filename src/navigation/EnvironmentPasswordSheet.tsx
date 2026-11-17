// The switch password prompt (2026-11-17, third brief): the drawer's "Service Desk environment" row opens THIS first;
// only a correct password opens the environment sheet (./EnvironmentSheet.tsx). The rules (hash, lockout, the single-use
// pass) are src/utils/switch-password.ts, with what this gate can and cannot stop.
// - A masked field with a show/hide toggle (`aria-label` "Show password" / "Hide password"). No autofill, no
//   autocorrect, no saving to a password manager.
// - One short line: it is for testing, and most people never need it.
// - Wrong: said plainly, with the tries left; the field is emptied for the next try. After 5 wrong tries every try is
//   refused for 60 seconds, and it says so (no timer: each try during the lock says how long is left).
// - Cancel (or back, or a tap outside) closes it and changes nothing.
// - What was typed is never logged, stored or sent. It is handed to the check once and the field is cleared at once,
//   right or wrong; closing the prompt clears it too. Nothing remembers a correct entry: the next switch asks again.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { FieldLabel, OutlineButton, Sheet, SubmitButton } from '@/components';
import { useSingleFlight } from '@/hooks';
import { colors } from '@/theme';
import { environmentSwitchGate, passwordCheckMessage, type SwitchPass } from '@/utils/switch-password';

/** The line under the title. */
export const SWITCH_PASSWORD_HELP = 'For testing only. Most people never need this: Setu stays on Production.';

export function EnvironmentPasswordSheet({
  visible, onCancel, onUnlocked,
}: {
  visible: boolean;
  onCancel: () => void;
  /** A correct password: the pass is good for ONE switch. */
  onUnlocked: (pass: SwitchPass) => void;
}) {
  const [value, setValue] = useState('');
  const [shown, setShown] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const once = useSingleFlight();

  // Each time it opens: an empty, masked field, and the lockout said at once if it is still running.
  useEffect(() => {
    setValue('');
    setShown(false);
    const locked = visible ? environmentSwitchGate.lockedForMs() : 0;
    setMessage(locked > 0 ? passwordCheckMessage({ ok: false, reason: 'locked', retryInMs: locked }) : null);
  }, [visible]);

  const submit = () =>
    void once(async () => {
      if (!value) return;
      const entered = value;
      setValue(''); // right or wrong, the field is empty again at once
      setChecking(true);
      try {
        const result = await environmentSwitchGate.check(entered);
        if (result.ok) {
          setMessage(null);
          setShown(false);
          onUnlocked(result.pass);
        } else {
          setMessage(passwordCheckMessage(result));
        }
      } catch {
        setMessage("Couldn't check the password. Try again.");
      } finally {
        setChecking(false);
      }
    });

  const cancel = () => {
    if (checking) return;
    setValue('');
    setMessage(null);
    onCancel();
  };

  return (
    <Sheet visible={visible} title="Switch password" onClose={cancel} avoidKeyboard>
      <View className="px-4 pb-2">
        <Text className="mb-3 text-sm text-gray-600">{SWITCH_PASSWORD_HELP}</Text>
        <FieldLabel label="Password" required />
        <View className={`min-h-11 flex-row items-center rounded-lg border bg-white ${message ? 'border-red-600' : 'border-gray-300'}`}>
          <TextInput
            value={value}
            onChangeText={(text) => {
              setValue(text);
              if (message && environmentSwitchGate.lockedForMs() === 0) setMessage(null);
            }}
            secureTextEntry={!shown}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            spellCheck={false}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!checking}
            accessibilityLabel="Switch password, required"
            className="min-h-11 flex-1 px-3 py-2 text-base text-gray-900"
          />
          <Pressable
            accessibilityRole="button"
            aria-label={shown ? 'Hide password' : 'Show password'}
            onPress={() => setShown((now) => !now)}
            hitSlop={4}
            className="h-11 w-11 items-center justify-center active:opacity-60"
          >
            <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.text.body} />
          </Pressable>
        </View>
        {message ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="mt-1 text-sm text-red-700">
            {message}
          </Text>
        ) : null}
        <View className="mt-4">
          <SubmitButton label="Continue" onPress={submit} disabled={!value} loading={checking} />
        </View>
        <View className="mt-2">
          <OutlineButton label="Cancel" onPress={cancel} disabled={checking} />
        </View>
      </View>
    </Sheet>
  );
}
