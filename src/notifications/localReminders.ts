// Local (on-device) notifications for SLA reminders — the only notifications this app schedules (docs/SLA-REMINDERS.md).
// Not push: nothing here talks to Expo's or Google's servers, and the text never leaves the phone (08 S10 is about push
// payloads). Android: channel `sla` (one of the fixed ids in 08 §8); POST_NOTIFICATIONS is asked at first need, from a
// tap on Home or in Settings, never at launch (08 §8).
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { reminderCopy, type SlaReminder } from '@/utils/sla-reminders';

export const SLA_CHANNEL_ID = 'sla';
const DATA_KIND = 'sla-reminder';
/** A replanned "fire now" moves by a few seconds each time; that is the same reminder, not a new one. */
const SAME_FIRE_TOLERANCE_MS = 60_000;

interface ReminderData {
  kind: typeof DATA_KIND;
  key: string;
  ticketId: string;
  fireAt: number;
}

function isReminderData(data: unknown): data is ReminderData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Partial<ReminderData>;
  return d.kind === DATA_KIND && typeof d.key === 'string' && typeof d.ticketId === 'string' && typeof d.fireAt === 'number';
}

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

function toPermission(result: { granted: boolean; canAskAgain: boolean }): ReminderPermission {
  if (result.granted) return 'granted';
  return result.canAskAgain ? 'undetermined' : 'denied';
}

/** The OS permission as it stands, without prompting. */
export async function getReminderPermission(): Promise<ReminderPermission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

/** The OS prompt. Called from a tap only (first need), never on launch. */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  return toPermission(await Notifications.requestPermissionsAsync());
}

let handlerSet = false;

/** A reminder that fires while the app is open is still shown (the default would be silent). Once, before scheduling. */
function ensureHandler(): void {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(SLA_CHANNEL_ID, {
    name: 'SLA reminders',
    description: 'A heads-up 30 minutes before a response or resolution deadline on a ticket assigned to you.',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#D51B28',
  });
}

async function scheduledReminders(): Promise<Array<{ id: string; data: ReminderData }>> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const out: Array<{ id: string; data: ReminderData }> = [];
  for (const request of all) {
    const data: unknown = request.content.data;
    if (isReminderData(data)) out.push({ id: request.identifier, data });
  }
  return out;
}

/**
 * Make the OS schedule match `plan`: cancel reminders no longer planned (or moved), schedule the missing ones.
 * Touches only notifications carrying our `data.kind`, so anything else the app schedules later is left alone.
 */
export async function syncScheduledReminders(plan: readonly SlaReminder[]): Promise<void> {
  ensureHandler();
  await ensureChannel();
  const wanted = new Map(plan.map((r) => [r.key, r] as const));
  const existing = await scheduledReminders();
  const kept = new Set<string>();
  await Promise.all(
    existing.map(async ({ id, data }) => {
      const planned = wanted.get(data.key);
      if (planned && Math.abs(planned.fireAt - data.fireAt) <= SAME_FIRE_TOLERANCE_MS) {
        kept.add(data.key);
        return;
      }
      await Notifications.cancelScheduledNotificationAsync(id);
    }),
  );
  for (const r of plan) {
    if (kept.has(r.key)) continue;
    const { title, body } = reminderCopy(r);
    const data: ReminderData = { kind: DATA_KIND, key: r.key, ticketId: r.ticketId, fireAt: r.fireAt };
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.fireAt), channelId: SLA_CHANNEL_ID },
    });
  }
}

/** Every reminder this app scheduled — on sign-out and when the setting is turned off. */
export async function cancelAllSlaReminders(): Promise<void> {
  const existing = await scheduledReminders();
  await Promise.all(existing.map(({ id }) => Notifications.cancelScheduledNotificationAsync(id)));
}

/** The ticket behind a tapped reminder, or null for any other notification. */
export function ticketIdFromResponse(response: Notifications.NotificationResponse | null): string | null {
  const data: unknown = response?.notification.request.content.data;
  return isReminderData(data) ? data.ticketId : null;
}

/** Taps while the app is running, plus the tap that launched it (cold start). Returns the unsubscribe. */
export function onReminderOpened(handler: (ticketId: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const ticketId = ticketIdFromResponse(response);
    if (ticketId) handler(ticketId);
  });
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const ticketId = ticketIdFromResponse(response);
      if (ticketId) handler(ticketId);
    })
    .catch(() => undefined);
  return () => subscription.remove();
}
