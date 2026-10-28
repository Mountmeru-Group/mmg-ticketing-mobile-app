// iOS action sheets (HIG: Action sheets) for the short, fixed choices on the write path: More options on a ticket, a
// list card's status, impact, urgency, the closure code and an attachment's source (docs/ios/00-PORT-MANIFEST.md §4.11).
// Long lists that come from the server (categories, groups, countries, people) stay in the scrollable sheets
// (OptionSheet, PersonPickerSheet). Cancel is always the last button; a destructive choice is drawn in red.
// WHICH choices a role gets is never decided here: the role-driven builders below only label what permissions.ts
// returns (ticketDetailPermissions().moreActions, inlineStatusTransitions()), in its order, adding and dropping nothing.
import { ActionSheetIOS } from 'react-native';

import { colors } from '@/theme';
import type { TicketStatus } from '@/types';
import type { MoreAction } from './permissions';
import type { StatusTransition } from './ticket-rules';

export interface SheetChoice<T extends string> {
  value: T;
  label: string;
  /** Drawn in red (HIG: a choice that destroys or cancels something). */
  destructive?: boolean;
}

export const CANCEL_LABEL = 'Cancel';

/** Show an action sheet. Resolves the chosen value, or null for Cancel (or a tap outside the sheet). */
export function chooseFromActionSheet<T extends string>({
  title, message, choices,
}: {
  title: string;
  message?: string;
  choices: readonly SheetChoice<T>[];
}): Promise<T | null> {
  return new Promise((resolve) => {
    const destructive = choices.flatMap((choice, index) => (choice.destructive ? [index] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [...choices.map((choice) => choice.label), CANCEL_LABEL],
        cancelButtonIndex: choices.length,
        destructiveButtonIndex: destructive.length > 0 ? destructive : undefined,
        tintColor: colors.primary,
      },
      (index) => resolve(index >= 0 && index < choices.length ? choices[index]!.value : null),
    );
  });
}

/**
 * A form field's short fixed choices as an action sheet titled with the field's label (iOS-3c: the request form's Impact
 * and Urgency, a task's Status). Resolves the chosen value, or null for Cancel.
 */
export function chooseForField<T extends string>(label: string, choices: readonly SheetChoice<T>[]): Promise<T | null> {
  return chooseFromActionSheet({ title: label, choices });
}

/** More options on M4, as Android labelled them. */
export const MORE_ACTION_LABELS: Record<MoreAction, string> = {
  pickup: 'Pick up',
  assign: 'Assign…',
  close: 'Close…',
  approval: 'Submit for approval…',
};

/** M4's More options: exactly ticketDetailPermissions().moreActions, in its order. */
export function moreActionChoices(actions: readonly MoreAction[]): SheetChoice<MoreAction>[] {
  return actions.map((value) => ({ value, label: MORE_ACTION_LABELS[value] }));
}

/**
 * A ticket's status changes: exactly the transitions given (inlineStatusTransitions() on a list card), in their order.
 * Canceled is the one drawn in red, as Android's closure form draws it (StatusClosureScreen `saveTone`).
 */
export function transitionChoices(transitions: readonly StatusTransition[]): SheetChoice<TicketStatus>[] {
  return transitions.map((t) => ({ value: t.target, label: t.label, destructive: t.target === 'CANCELED' }));
}
