// Progress and per-ticket results of a bulk action (08 §4.2). Cannot be dismissed while running; "Stop" lets the
// request in flight finish and sends nothing more.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BulkOutcome, BulkProgress } from '@/hooks/useBulkRunner';
import { palette } from '@/theme';

const OUTCOME_STYLE: Record<BulkOutcome['state'], { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  done: { icon: 'checkmark-circle', color: palette.green[600], label: 'Done' },
  failed: { icon: 'close-circle', color: palette.red[600], label: 'Failed' },
  skipped: { icon: 'remove-circle-outline', color: palette.gray[500], label: 'Skipped' },
  'not-run': { icon: 'pause-circle-outline', color: palette.amber[600], label: 'Not sent' },
};

export function BulkProgressModal({ progress, onStop, onClose }: { progress: BulkProgress | null; onStop: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!progress) return null;
  const { running, sent, toSend, current, outcomes, stopReason, stopRequested, title } = progress;
  const percent = toSend > 0 ? Math.round((sent / toSend) * 100) : 100;
  const count = (state: BulkOutcome['state']) => outcomes.filter((o) => o.state === state).length;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => (running ? undefined : onClose())} statusBarTranslucent>
      <View className="flex-1 justify-end bg-black/40">
        <View style={{ paddingBottom: insets.bottom + 12 }} className="max-h-[80%] rounded-t-2xl bg-white px-4 pt-4">
          <Text className="text-base font-semibold text-gray-900" accessibilityRole="header">{title}</Text>

          <View className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: toSend, now: sent }}>
            <View style={{ width: `${percent}%` }} className="h-2 rounded-full bg-primary" />
          </View>
          <Text className="mt-2 text-sm text-gray-700">
            {running
              ? `${stopRequested ? 'Stopping after the current ticket… ' : ''}Sending ${Math.min(sent + 1, toSend)} of ${toSend}${current ? ` (${current})` : ''}`
              : `Finished: ${count('done')} done · ${count('failed')} failed · ${count('skipped')} skipped · ${count('not-run')} not sent`}
          </Text>
          {!running && stopReason ? <Text className="mt-1 text-sm text-amber-800">Stopped: {stopReason}</Text> : null}

          <ScrollView className="mt-3" style={{ maxHeight: 320 }}>
            {outcomes.map((o) => {
              const style = OUTCOME_STYLE[o.state];
              return (
                <View key={o.id} className="flex-row items-start border-b border-gray-100 py-2">
                  <Ionicons name={style.icon} size={18} color={style.color} />
                  <View className="ml-2 flex-1">
                    <Text className="text-sm text-gray-900">
                      {o.label} · {style.label}
                    </Text>
                    {o.message ? <Text className="text-xs text-gray-600">{o.message}</Text> : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View className="mt-3">
            {running ? (
              <Pressable
                accessibilityRole="button"
                disabled={stopRequested}
                onPress={onStop}
                className={`h-12 items-center justify-center rounded-lg border border-red-300 ${stopRequested ? 'opacity-50' : ''}`}
              >
                <Text className="text-base font-semibold text-red-700">{stopRequested ? 'Stopping…' : 'Stop'}</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={onClose} className="h-12 items-center justify-center rounded-lg bg-primary">
                <Text className="text-base font-semibold text-primary-foreground">Close</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
