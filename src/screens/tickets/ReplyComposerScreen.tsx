// M5 Reply / Note composer (04 M5, 05 §A.5, §A.16).
// - Modes: Reply (everyone), Reply all (staff, TKT-9 pre-fill), Private note (ADMIN and AGENT ONLY — the option
//   does not exist for END_USER or L2_MANAGER; usePostComment refuses it too).
// - To / CC chips for staff on public replies; suggestions via USR-3 for ADMIN/AGENT.
// - Plain-text body, sent as escaped <p> HTML. Files: camera / photos / documents, checked before staging.
// - Send is the only write: files upload first (ATT-2), then CMT-2 with their ids. Disabled while in flight.
//   On success the composer closes and the conversation refetches.
// - Templates (staff, LKP-7 canned responses, SDP "response templates"): picked from a sheet; an empty body is replaced,
//   otherwise the template is appended (05 §A.5 insert rule, utils/compose.ts insertTemplate).
// - Draft (02 §5.4): the text and mode are kept on this phone while typing (hooks/useDraft.ts) and restored when the
//   composer is opened again for the same ticket; cleared on send and on Discard. Recipients and files are not drafted.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { UploadFile } from '@/api/attachments.api';
import { describeError, describeWriteError, isSessionEndedError } from '@/api/errors';
import {
  AttachmentPicker, EmailChipsInput, ErrorState, FieldLabel, FormCard, InlineError, LoadingSkeleton, Notice, OfflineBanner,
  OfflineState, OptionSheet, ScreenHeader, SubmitButton, type SheetOption,
} from '@/components';
import {
  filesUploadedBefore, useCannedResponses, useDiscardGuard, useDraft, useEmailRecipients, usePostComment, useSingleFlight,
  useTicket,
} from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette } from '@/theme';
import type { TicketStackScreenProps } from '@/types';
import { finalRecipients, insertTemplate, isBlankBody, isValidEmail } from '@/utils/compose';
import { notify } from '@/utils/dialogs';
import { htmlToDisplayText } from '@/utils/html';
import { composerPermissions, type ComposerMode } from '@/utils/permissions';
import { isPlaceholderUser } from '@/utils/session';

type Mode = ComposerMode;

const MODE_LABELS: Record<Mode, string> = { reply: 'Reply', replyAll: 'Reply all', note: 'Private note' };

/** What the local draft holds: the typed text and the composer mode. */
interface ReplyDraft {
  mode: Mode;
  text: string;
}

export function ReplyComposerScreen({ navigation, route }: TicketStackScreenProps<'ReplyComposer'>) {
  const { ticketId } = route.params;
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'END_USER';
  // Modes and recipient fields come from composerPermissions() (utils/permissions.ts, pinned per role by tests/rbac).
  // Private note is not an option at all for END_USER / L2_MANAGER (hidden, not disabled); a route asking for a mode
  // the role doesn't have opens as a plain reply.
  const can = composerPermissions(role);
  const modes = can.modes;
  const staff = can.recipients;
  const [mode, setMode] = useState<Mode>(modes.includes(route.params.mode) ? route.params.mode : 'reply');
  const isPublic = mode !== 'note';
  const showRecipients = can.recipients && isPublic;

  const ticketQuery = useTicket(ticketId);
  const ticket = ticketQuery.data;
  const requesterEmail = ticket?.requester?.email && isValidEmail(ticket.requester.email) ? ticket.requester.email : null;
  const recipients = useEmailRecipients(ticketId, { enabled: mode === 'replyAll' && staff });

  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const post = usePostComment();
  const once = useSingleFlight();

  // ── Draft (02 §5.4) ──
  const draftKey = user ? `reply:${user.id}:${ticketId}` : null;
  const draftValue = useMemo<ReplyDraft>(() => ({ mode, text }), [mode, text]);
  const draft = useDraft<ReplyDraft>(draftKey, draftValue, (d) => isBlankBody(d.text));
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);
  // Applied once per restored draft: `modes` is rebuilt every render, so it must not be a dependency here.
  useEffect(() => {
    if (!draft.restored) return;
    setText(draft.restored.text);
    if (modes.includes(draft.restored.mode)) setMode(draft.restored.mode);
    setRestoredFromDraft(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.restored]);
  const discardDraft = () => {
    draft.discard();
    setText('');
    setRestoredFromDraft(false);
  };

  // ── Templates (LKP-7, staff) ──
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const canned = useCannedResponses({ enabled: templatesOpen && staff });
  const templateOptions = useMemo<SheetOption<string>[]>(
    () => (canned.data ?? []).map((c) => ({ value: c.id, label: c.title, description: c.category ?? undefined })),
    [canned.data],
  );
  const applyTemplate = (id: string) => {
    const template = canned.data?.find((c) => c.id === id);
    if (template) setText((current) => insertTemplate(current, htmlToDisplayText(template.body)));
  };

  // Quick-action pre-fill (05 §A.5): Reply → To = requester; Reply all → TKT-9, falling back to the requester.
  useEffect(() => {
    if (!showRecipients) return;
    const fallback = requesterEmail ? [requesterEmail] : [];
    if (mode === 'reply') {
      setTo(fallback);
      setCc([]);
    } else if (recipients.data) {
      const serverTo = (recipients.data.to ?? []).filter((e) => typeof e === 'string' && isValidEmail(e));
      setTo(serverTo.length > 0 ? serverTo : fallback);
      setCc((recipients.data.cc ?? []).filter((e) => typeof e === 'string' && isValidEmail(e)));
    } else if (recipients.isError) {
      setTo(fallback); // CC unchanged, as the web does
    }
  }, [mode, showRecipients, requesterEmail, recipients.data, recipients.isError]);

  const empty = isBlankBody(text) && files.length === 0;
  const { leave } = useDiscardGuard({
    dirty: !isBlankBody(text) || files.length > 0,
    busy: post.isPending,
    what: isPublic ? 'reply' : 'note',
    onDiscard: draft.discard,
  });

  async function send() {
    setError(null);
    try {
      await post.mutateAsync({
        ticketId,
        type: isPublic ? 'PUBLIC' : 'PRIVATE',
        text,
        to: showRecipients ? finalRecipients(to, toInput) : [],
        cc: showRecipients ? finalRecipients(cc, ccInput) : [],
        files,
      });
      draft.discard();
      notify(isPublic ? 'Reply sent' : 'Note saved');
      leave(() => navigation.goBack());
    } catch (e) {
      // Files ATT-2 already accepted stay on the ticket: take them off the form so a retry doesn't upload them twice.
      const uploaded = filesUploadedBefore(e);
      if (uploaded.length > 0) setFiles((prev) => prev.filter((f) => !uploaded.some((u) => u === f || u.uri === f.uri)));
      if (!isSessionEndedError(e)) setError(describeWriteError(e));
    }
  }

  const title = ticket ? `${MODE_LABELS[mode]} · #${ticket.ticketNumber}` : MODE_LABELS[mode];

  if (!ticket) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title={title} variant="close" />
        <OfflineBanner />
        {ticketQuery.fetchStatus === 'paused' ? (
          <OfflineState what="This ticket" />
        ) : ticketQuery.isError ? (
          <ErrorState error={ticketQuery.error} title="Couldn't load this ticket" onRetry={() => void ticketQuery.refetch()} />
        ) : (
          <LoadingSkeleton variant="formPage" rows={2} />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: palette.gray[50] }}>
      <ScreenHeader title={title} variant="close" />
      <OfflineBanner />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}>
        <Text className="mx-4 mb-3 text-sm text-gray-500" numberOfLines={2}>
          #{ticket.ticketNumber} · {ticket.title}
        </Text>

        {modes.length > 1 ? (
          <View className="mx-4 mb-3 flex-row rounded-xl bg-gray-200 p-1" accessibilityRole="tablist">
            {modes.map((m) => (
              <Pressable
                key={m}
                accessibilityRole="tab"
                accessibilityState={{ selected: m === mode, disabled: post.isPending }}
                disabled={post.isPending}
                onPress={() => setMode(m)}
                className={`min-h-11 flex-1 items-center justify-center rounded-lg px-1 ${m === mode ? (m === 'note' ? 'bg-amber-100' : 'bg-white') : ''}`}
              >
                <Text className={`text-center text-sm ${m === mode ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{MODE_LABELS[m]}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <FormCard>
          {showRecipients ? (
            <>
              {mode === 'replyAll' && recipients.isFetching ? <Text className="mb-1 text-xs text-gray-500">Loading thread recipients…</Text> : null}
              {mode === 'replyAll' && recipients.isError && !recipients.isFetching ? (
                <Pressable accessibilityRole="button" onPress={() => void recipients.refetch()} className="mb-3 min-h-11 justify-center rounded-lg bg-amber-50 p-3">
                  <Text className="text-xs text-amber-900">
                    Couldn't load the thread's recipients ({describeError(recipients.error)}). To is set to the requester only.{' '}
                    <Text className="font-semibold">Tap to retry.</Text>
                  </Text>
                </Pressable>
              ) : null}
              <EmailChipsInput label="To" chips={to} onChangeChips={setTo} input={toInput} onChangeInput={setToInput} suggest={can.suggestRecipients} disabled={post.isPending} />
              <EmailChipsInput label="Cc" chips={cc} onChangeChips={setCc} input={ccInput} onChangeInput={setCcInput} suggest={can.suggestRecipients} disabled={post.isPending} />
            </>
          ) : null}

          <FieldLabel label={isPublic ? 'Message' : 'Note'} hint="Write a message, attach a file, or both." />
          <TextInput
            value={text}
            onChangeText={setText}
            editable={!post.isPending}
            multiline
            textAlignVertical="top"
            placeholder={isPublic ? 'Type your reply…' : 'Type an internal note…'}
            placeholderTextColor={colors.text.secondary}
            accessibilityLabel={isPublic ? 'Reply message' : 'Internal note'}
            className={`mb-1 min-h-40 rounded-lg border px-3 py-2 text-base text-gray-900 ${isPublic ? 'border-gray-300 bg-white' : 'border-amber-300 bg-amber-50'}`}
          />
          <View className="mb-3 flex-row flex-wrap items-center">
            {staff ? (
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Opens the list of reply templates"
                disabled={post.isPending}
                onPress={() => setTemplatesOpen(true)}
                className="mr-4 min-h-11 justify-center"
              >
                <Text className="text-sm font-medium text-blue-700">Insert a template</Text>
              </Pressable>
            ) : null}
            {restoredFromDraft ? (
              <View className="min-h-11 flex-1 flex-row flex-wrap items-center">
                <Text className="text-xs text-gray-500">Draft restored. </Text>
                <Pressable accessibilityRole="button" disabled={post.isPending} onPress={discardDraft} hitSlop={8}>
                  <Text className="text-xs font-medium text-blue-700">Discard draft</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <FieldLabel label="Attachments" />
          <AttachmentPicker files={files} onChange={setFiles} disabled={post.isPending} />
        </FormCard>

        <View className="mx-4">
          {isPublic && staff ? (
            <Notice tone="warning">
              Public replies are emailed to the requester, everyone on the original email thread, and the assigned technician.
              Removing an address here does not stop emails to people on the original thread.
            </Notice>
          ) : null}
          {isPublic && !staff ? <Notice>Your reply is added to the ticket and emailed to the people working on it.</Notice> : null}
          {!isPublic ? (
            <Notice>Internal note: visible to Admins and Technicians only, and not emailed. Files are added to the ticket, not to this note.</Notice>
          ) : null}
          {!isPublic && isPlaceholderUser(user) ? (
            <Notice tone="warning">
              This session was saved before the developer token was checked with the server, so the app can't confirm your
              role. If the account is not an Admin or Technician, the server will send this note as a PUBLIC email. Sign out
              and paste the token again to fix this.
            </Notice>
          ) : null}
        </View>

        <InlineError message={error} />

        <View className="mx-4">
          <SubmitButton
            label={isPublic ? 'Send Reply' : 'Save Note'}
            onPress={() => void once(send)}
            disabled={empty}
            loading={post.isPending}
            tone={isPublic ? 'primary' : 'muted'}
          />
        </View>
      </ScrollView>

      <OptionSheet
        visible={templatesOpen}
        title="Reply templates"
        options={templateOptions}
        selected={null}
        onSelect={applyTemplate}
        onClose={() => setTemplatesOpen(false)}
      >
        {canned.fetchStatus === 'paused' && !canned.data ? (
          <Text className="px-4 py-8 text-center text-sm text-gray-500">Templates load when you reconnect.</Text>
        ) : canned.isPending ? (
          <View className="items-center py-8">
            <ActivityIndicator color={colors.primary} />
            <Text className="mt-2 text-sm text-gray-500">Loading templates…</Text>
          </View>
        ) : canned.isError && !canned.data ? (
          <ErrorState error={canned.error} title="Couldn't load the templates" onRetry={() => void canned.refetch()} />
        ) : canned.data && canned.data.length === 0 ? (
          <Text className="px-4 py-8 text-center text-sm text-gray-500">No reply templates have been set up yet.</Text>
        ) : undefined}
      </OptionSheet>
    </KeyboardAvoidingView>
  );
}
