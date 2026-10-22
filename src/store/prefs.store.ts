// Per-device preferences: this phone only, never the account. Kept in SecureStore because AsyncStorage is not
// installed (auth.store.ts has the same note); none of the values is a secret.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { ReminderPermission } from '@/notifications/localReminders';

const KEYS = {
  slaReminders: 'mmg.pref.slaReminders',
} as const;

interface PrefsState {
  /** SLA reminders (docs/SLA-REMINDERS.md). null until load() has run; default on. The OS prompt is still a separate, explicit step. */
  slaReminders: boolean | null;
  /** The OS notification permission as last read; null until checked. Not persisted: the OS is the source. */
  reminderPermission: ReminderPermission | null;

  load: () => Promise<void>;
  setSlaReminders: (on: boolean) => Promise<void>;
  setReminderPermission: (permission: ReminderPermission) => void;
}

export const usePrefsStore = create<PrefsState>()((set) => ({
  slaReminders: null,
  reminderPermission: null,

  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEYS.slaReminders);
      set({ slaReminders: raw === null ? true : raw === '1' });
    } catch {
      set({ slaReminders: true }); // unreadable store: the default, for this run
    }
  },

  setSlaReminders: async (on) => {
    set({ slaReminders: on });
    try {
      await SecureStore.setItemAsync(KEYS.slaReminders, on ? '1' : '0');
    } catch {
      // Not persisted: the choice holds until the app restarts.
    }
  },

  setReminderPermission: (reminderPermission) => set({ reminderPermission }),
}));
