// Push state for this run of the app (G7). In memory only: nothing here is written to disk. The FCM token is not a
// session secret, but it is still never logged and never persisted (CLAUDE.md rule 8); Firebase keeps its own copy and
// hands it back on request (src/push/platform.ts getToken).
import { create } from 'zustand';

import type { PushStatus } from '@/utils/push';

interface PushState {
  /** What the Alerts screen tells the person (utils/push.ts pushNotice). */
  status: PushStatus;
  /** Whether Android will still show the permission dialog (false = only Settings can turn it on). */
  canAskAgain: boolean;
  /** The FCM token last obtained on this phone, so sign-out can unregister it (NTF-6) without asking Firebase again. */
  token: string | null;

  setStatus: (status: PushStatus, canAskAgain?: boolean) => void;
  setToken: (token: string | null) => void;
  reset: () => void;
}

const INITIAL = { status: 'checking', canAskAgain: true, token: null } as const satisfies Pick<PushState, 'status' | 'canAskAgain' | 'token'>;

export const usePushStore = create<PushState>()((set) => ({
  ...INITIAL,
  setStatus: (status, canAskAgain) => set(canAskAgain === undefined ? { status } : { status, canAskAgain }),
  setToken: (token) => set({ token }),
  reset: () => set({ ...INITIAL }),
}));
