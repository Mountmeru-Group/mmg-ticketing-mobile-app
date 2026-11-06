// One row of the M3 ticket list (04 M3): #, raised and updated, subject, status, priority, people, the SLA deadline,
// "new reply".
// - Dates (2026-11-05, UI-STANDARDS.md §16): "#19445 · Raised 2 Nov · updated 2d ago" on top. When the line is short
//   of room, "Raised …" gives way first: the number and "updated …" (how agents spot a stale ticket) always show.
// - The due line at the foot replaces the SLA chip: a clock and "Due Fri 13 Nov, 17:00" / "Breached 3 Nov, 12:00" in the
//   SLA colour, from slaDueLine() (utils/sla-deadline.ts), the detail screen's own rule. Never a countdown. Absent, not
//   empty, when there is nothing to show (Resolved, Closed, Canceled, no SLA). Static: computed on render from `now`.
// - Inline status chip (08 §4.1): tappable only when the list passes onStatusPress, i.e. staff with at least one valid
//   transition for this ticket. The chip itself never writes; the list asks first.
// - Selection (08 §4.2): tap-and-hold starts multi-select; the list owns the selection and its 20-ticket cap.
// - People row (2026-11-03): avatars, a static arrow, under a hairline rule (./PeopleRow.tsx).
// - Press feedback (2026-11-03): the card dips and dims while held (./PressFeedback.tsx). One native timing per press;
//   never a loop.
// - Swipe left (2026-11-03): reveals Assign and Resolve, each only where a tap already offers it (ticketSwipeActions in
//   utils/permissions.ts). react-native-gesture-handler's Swipeable moves the row with `translateX` on the native
//   driver. How it stays out of FlashList's recycling and the long-press selection: SwipeRow below, and
//   docs/PERFORMANCE.md §13.
// - iOS-4, VoiceOver: the card is one element, so the status chip inside it can't be reached on its own. Changing the
//   status and selecting are the card's custom actions instead (the VoiceOver rotor's Actions), the same two callbacks.
// - iOS-5f, VoiceOver (ANDROID-DELTA.md §10, decision 3): the swipe's Assign and Resolve are custom actions too, under
//   exactly the swipe's rules: the same list (ticketSwipeActions) and only while the row would swipe (a swipeable role,
//   not selecting). They call the same handler as the revealed buttons.
// - iOS-4, large text: at the accessibility text sizes the header line stacks (HIG Typography: "consider using a
//   stacked layout where text appears above secondary items"), and the dates and the due line wrap rather than cut.
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { reduceMotionEnabled } from '@/hooks';
import { useAccessibilityTextSize } from '@/hooks/useTextSize';
import { colors, motion, palette } from '@/theme';
import type { Ticket, UserRole } from '@/types';
import { formatRelative, formatRelativeShort, formatShortDate, peopleRowLabel, statusLabel } from '@/utils/format';
import { ticketSwipeActions, type SwipeAction, type Viewer } from '@/utils/permissions';
import { isStaff } from '@/utils/roles';
import { slaDueLine } from '@/utils/sla-deadline';
import { PeopleRow } from './PeopleRow';
import { usePressFeedback } from './PressFeedback';
import { PriorityBadge } from './PriorityBadge';
import { StatusBadge } from './StatusBadge';

interface TicketCardProps {
  ticket: Ticket;
  role: UserRole;
  onPress: (ticketId: string) => void;
  onLongPress?: (ticketId: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
  /** Present only when this ticket has valid transitions for this role. */
  onStatusPress?: (ticket: Ticket) => void;
  /** A status change for this ticket is in flight. */
  statusBusy?: boolean;
  /**
   * Present only for a role whose rows are swipeable (canSwipeTickets). Which actions this ticket reveals is
   * ticketSwipeActions(swipeViewer, ticket); none = the row does not move.
   */
  swipeViewer?: Viewer | null;
  onSwipeAction?: (action: SwipeAction, ticket: Ticket) => void;
  /** The list keeps one row open at a time and closes it when a scroll starts. */
  onSwipeOpen?: (row: Swipeable) => void;
  onSwipeClose?: (row: Swipeable) => void;
  /** The phone's clock for the dates (ms). The list reads it on render, on focus and on return to the app. */
  now?: number;
}

function TicketCardImpl({
  ticket, role, onPress, onLongPress, selectionMode = false, selected = false, onStatusPress, statusBusy = false,
  swipeViewer, onSwipeAction, onSwipeOpen, onSwipeClose, now = Date.now(),
}: TicketCardProps) {
  const staff = isStaff(role);
  // 05 §A.9: highlight rows whose requester replied last. Staff only — for END_USER the requester is themselves.
  const newReply = staff && !!ticket.lastRequesterReplyAt;
  const chipInteractive = !!onStatusPress && !selectionMode;
  const feedback = usePressFeedback();
  const swipeable = swipeViewer !== undefined;
  const largeText = useAccessibilityTextSize();
  // iOS: what a swipe would reveal on this row right now, offered to VoiceOver as well (decision 3).
  const swipeActions = swipeable && !selectionMode ? ticketSwipeActions(swipeViewer, ticket) : [];
  const voiceOverActions = [
    ...(chipInteractive && !statusBusy ? [{ name: 'changeStatus', label: 'Change status' }] : []),
    ...(onLongPress && !selectionMode ? [{ name: 'select', label: 'Select' }] : []),
    ...swipeActions.map((action) => ({ name: action, label: ACTION_LOOK[action].label })),
  ];

  // The standard card (Card.tsx). Selected: brand primary edge, as every selected state. New reply: the blue accent
  // edge, the app's information colour.
  const border = selected
    ? 'border-primary bg-red-50'
    : newReply
      ? 'border-blue-200 border-l-4 border-l-blue-600 bg-white'
      : 'border-border bg-white';
  // Meta text one shade darker on the selected tint: gray-500 on red-50 is 4.4:1, below WCAG AA.
  const meta = selected ? 'text-gray-600' : 'text-gray-500';
  const people = peopleRowLabel(ticket.requester?.displayName, ticket.assignedTo?.displayName, staff);
  const raised = formatShortDate(ticket.createdAt, now);
  const due = slaDueLine(ticket, now);
  const dueColor = due ? colors.slaDue[due.tone] : undefined;

  const card = (
    // The card's 16 dp gutters and 12 dp gap sit on the swipe row when there is one (so its actions line up with the
    // card), otherwise here.
    <Animated.View style={[feedback.style, swipeable ? null : styles.box]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={selectionMode ? { selected } : undefined}
        accessibilityLabel={
          `Ticket ${ticket.ticketNumber}: ${ticket.title}${newReply ? ', new reply' : ''}. ${people}. ` +
          `Raised ${raised}, updated ${formatRelative(ticket.updatedAt, now)}${due ? `. ${due.label}` : ''}`
        }
        accessibilityHint={onLongPress && !selectionMode ? 'Long press to select several tickets' : undefined}
        accessibilityActions={voiceOverActions.length > 0 ? voiceOverActions : undefined}
        onAccessibilityAction={(event) => {
          const actionName = event.nativeEvent.actionName;
          if (actionName === 'changeStatus') onStatusPress?.(ticket);
          else if (actionName === 'select') onLongPress?.(ticket.id);
          else {
            const swipe = swipeActions.find((action) => action === actionName);
            if (swipe) onSwipeAction?.(swipe, ticket);
          }
        }}
        onPress={() => onPress(ticket.id)}
        onLongPress={onLongPress ? () => onLongPress(ticket.id) : undefined}
        delayLongPress={350}
        {...feedback.pressProps()}
        className={`min-h-11 rounded-xl border p-4 ${border}`}
      >
        <View className={largeText ? 'mb-1 items-start' : 'mb-1 flex-row items-center'}>
          {selectionMode ? (
            <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={20} color={selected ? colors.primary : colors.text.secondary} style={{ marginRight: 6 }} />
          ) : null}
          {largeText ? (
            // iOS-4: stacked at the accessibility sizes, and nothing is cut: the number, then the dates.
            <>
              <Text className={`text-xs font-semibold ${meta}`}>#{ticket.ticketNumber ?? '—'}</Text>
              <Text className={`text-xs ${meta}`}>{`Raised ${raised} · updated ${formatRelativeShort(ticket.updatedAt, now)}`}</Text>
            </>
          ) : (
            // Only "Raised …" may shrink (and end in …); the number and "updated …" never do.
            <View className="flex-1 flex-row items-center">
              <Text className={`text-xs font-semibold ${meta}`}>#{ticket.ticketNumber ?? '—'}</Text>
              <Text className={`shrink text-xs ${meta}`} numberOfLines={1}>
                {` · Raised ${raised}`}
              </Text>
              <Text className={`text-xs ${meta}`}>{` · updated ${formatRelativeShort(ticket.updatedAt, now)}`}</Text>
            </View>
          )}
          {newReply ? (
            <View className={`rounded-full bg-blue-600 px-2.5 py-0.5 ${largeText ? 'mt-1' : 'ml-2'}`}>
              <Text className="text-xs font-semibold text-white">New reply</Text>
            </View>
          ) : null}
        </View>

        <Text className={`text-base text-gray-900 ${newReply ? 'font-bold' : 'font-semibold'}`} numberOfLines={2}>
          {ticket.title || '(no subject)'}
        </Text>

        <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
          {chipInteractive ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Status ${statusLabel(ticket.status)}. Change status`}
              accessibilityState={{ disabled: statusBusy, busy: statusBusy }}
              disabled={statusBusy}
              onPress={() => onStatusPress?.(ticket)}
              hitSlop={12}
              className="min-h-5 flex-row items-center active:opacity-70"
            >
              <StatusBadge status={ticket.status} recordId={ticket.id} />
              {statusBusy ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 4 }} />
              ) : (
                <Ionicons name="chevron-down" size={14} color={palette.gray[600]} style={{ marginLeft: 2 }} />
              )}
            </Pressable>
          ) : (
            <StatusBadge status={ticket.status} recordId={ticket.id} />
          )}
          <PriorityBadge priority={ticket.priority} />
        </View>

        {/* People (2026-11-03): a hairline rule, then requester → technician. */}
        <View className="mt-3 border-border pt-2.5" style={styles.rule}>
          <PeopleRow
            requesterName={ticket.requester?.displayName}
            technicianName={ticket.assignedTo?.displayName}
            showRequester={staff}
            onTint={selected}
          />
        </View>

        {/* The SLA deadline (2026-11-05): absent, not empty, when there is none to show. */}
        {due ? (
          <View className="mt-2 flex-row items-center">
            <Ionicons name="time-outline" size={14} color={dueColor} />
            <Text className="ml-1 flex-1 text-xs font-semibold" style={{ color: dueColor }} numberOfLines={largeText ? undefined : 1}>
              {due.label}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );

  if (!swipeable) return card;
  const actions = ticketSwipeActions(swipeViewer, ticket);
  return (
    <SwipeRow
      ticket={ticket}
      actions={actions}
      enabled={!selectionMode && actions.length > 0}
      onAction={onSwipeAction}
      onOpen={onSwipeOpen}
      onClose={onSwipeClose}
    >
      {card}
    </SwipeRow>
  );
}

export const TicketCard = memo(TicketCardImpl);

// ── Swipe ────────────────────────────────────────────────────

const { actionWidth, dragStart, verticalFail, openThreshold, friction, reducedSpringSpeed } = motion.swipe;
/** "Remove animations" (iOS: Reduce Motion): the snap settles in a frame or two (bounciness 0, the native driver). */
const REDUCED_SPRING = { speed: reducedSpringSpeed };

const ACTION_LOOK: Record<SwipeAction, { label: string; icon: keyof typeof Ionicons.glyphMap; tone: { bg: string; fg: string } }> = {
  assign: { label: 'Assign', icon: 'person-add-outline', tone: colors.swipe.assign },
  resolve: { label: 'Resolve', icon: 'checkmark-circle-outline', tone: colors.swipe.resolve },
};

/**
 * The swipe wrapper. Kept out of the way of the list:
 * - Only a leftward drag of `dragStart` dp starts it (activeOffsetX), and any vertical travel of `verticalFail` dp
 *   first cancels it (failOffsetY), so scrolling never drags a row and the drawer's rightward edge swipe is untouched.
 *   (iOS: the tab root has no back swipe; a pushed screen's is a rightward edge swipe, untouched the same way.)
 * - Until the first drag the actions are one empty box of their width, so a resting row adds one view, not seven.
 * - A tap on an open row closes it (Swipeable's own tap handler; the card under it gets no press), so a long-press
 *   can start a selection only on a closed row. Entering selection disables every row (`enabled`).
 * - FlashList recycles a cell by giving it another ticket. If the cell was open, it is closed at once (`reset`, no
 *   animation) before the new ticket shows; the list also closes the open row when a scroll starts.
 */
function SwipeRow({
  ticket, actions, enabled, onAction, onOpen, onClose, children,
}: {
  ticket: Ticket;
  actions: readonly SwipeAction[];
  enabled: boolean;
  onAction?: (action: SwipeAction, ticket: Ticket) => void;
  onOpen?: (row: Swipeable) => void;
  onClose?: (row: Swipeable) => void;
  children: ReactNode;
}) {
  const ref = useRef<Swipeable>(null);
  const open = useRef(false);
  const shownId = useRef(ticket.id);
  const [revealed, setRevealed] = useState(false);

  useLayoutEffect(() => {
    if (shownId.current === ticket.id) return;
    shownId.current = ticket.id;
    if (open.current) {
      open.current = false;
      ref.current?.reset();
    }
  }, [ticket.id]);

  const renderActions = () =>
    revealed ? (
      <View className="flex-row overflow-hidden rounded-r-xl">
        {actions.map((action) => {
          const look = ACTION_LOOK[action];
          return (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={`${look.label} ticket ${ticket.ticketNumber}`}
              onPress={() => {
                ref.current?.close();
                onAction?.(action, ticket);
              }}
              style={[styles.action, { backgroundColor: look.tone.bg }]}
              className="min-h-11 items-center justify-center active:opacity-80"
            >
              <Ionicons name={look.icon} size={20} color={look.tone.fg} />
              <Text className="mt-1 text-xs font-semibold" style={{ color: look.tone.fg }} numberOfLines={1}>
                {look.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ) : (
      <View style={{ width: actions.length * actionWidth }} />
    );

  return (
    <Swipeable
      ref={ref}
      enabled={enabled}
      friction={friction}
      rightThreshold={openThreshold}
      overshootRight={false}
      activeOffsetX={-dragStart}
      failOffsetY={[-verticalFail, verticalFail]}
      animationOptions={reduceMotionEnabled() ? REDUCED_SPRING : undefined}
      containerStyle={styles.box}
      renderRightActions={actions.length > 0 ? renderActions : undefined}
      onSwipeableOpenStartDrag={() => setRevealed(true)}
      onSwipeableWillOpen={() => {
        open.current = true;
        if (ref.current) onOpen?.(ref.current);
      }}
      onSwipeableClose={() => {
        open.current = false;
        if (ref.current) onClose?.(ref.current);
      }}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  /** The standard card's place in a list: `mx-4 mb-3` (S2). */
  box: { marginHorizontal: 16, marginBottom: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth },
  action: { width: actionWidth },
});
