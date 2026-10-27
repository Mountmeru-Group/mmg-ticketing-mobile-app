// Reply templates (Phase G3, LKP-7): the web's "Templates" pop-up as a bottom sheet (docs/G3-WEB-BEHAVIOUR.md §1).
// Search on title or category, groups by category ("General" when none), "No templates found". Loads when the sheet
// first opens, never with the composer. Picking a template writes nothing: the composer inserts it into its own text.
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useMemo, useState } from 'react';
import { Modal, Pressable, SectionList, Text, View, type SectionListData } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCannedResponses, useStableCallback } from '@/hooks';
import { colors } from '@/theme';
import type { CannedResponse } from '@/types';
import { filterTemplates, groupTemplates, templatePreview } from '@/utils/templates';
import { SearchField } from './Filters';
import { LookupError } from './Form';
import { LoadingSkeleton } from './LoadingSkeleton';

interface TemplatePickerSheetProps {
  visible: boolean;
  onPick: (template: CannedResponse) => void;
  onClose: () => void;
}

export function TemplatePickerSheet({ visible, onPick, onClose }: TemplatePickerSheetProps) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  // Only while the sheet is open; reopening it within 60 s uses the cached list.
  const templates = useCannedResponses({ enabled: visible });

  const groups = useMemo(() => groupTemplates(filterTemplates(templates.data ?? [], search)), [templates.data, search]);
  // Phase P: a SectionList of memoised rows — each template's text preview is worked out once, not on every keystroke.
  const sections = useMemo<TemplateSection[]>(() => groups.map((g) => ({ key: g.category, data: g.templates })), [groups]);

  const close = () => {
    setSearch('');
    onClose();
  };
  const pick = useStableCallback((template: CannedResponse) => {
    setSearch('');
    onPick(template);
  });

  // Same sheet frame as OptionSheet and PersonPickerSheet: grab handle, title, search, then the list.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" onPress={close} className="flex-1 bg-black/40" />
      <View style={{ paddingBottom: insets.bottom + 8 }} className="max-h-[80%] rounded-t-2xl bg-white pt-2">
        <View className="mb-1 h-1 w-10 self-center rounded-full bg-gray-300" />
        <Text className="px-4 py-3 text-base font-semibold text-gray-900" accessibilityRole="header">Insert a template</Text>
        <View className="mx-4 mb-2">
          <SearchField
            value={search}
            onChangeText={setSearch}
            onClear={() => setSearch('')}
            placeholder="Search templates…"
            accessibilityLabel="Search templates by title or category"
          />
        </View>
        <SectionList
          sections={sections}
          keyExtractor={templateKey}
          stickySectionHeadersEnabled={false}
          initialNumToRender={20}
          removeClippedSubviews={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {templates.data === undefined && templates.isFetching ? <LoadingSkeleton variant="lines" rows={4} topGap={false} /> : null}
              {templates.data === undefined && templates.fetchStatus === 'paused' ? (
                <Text className="px-4 py-6 text-center text-sm text-gray-500">Templates load when you're back online.</Text>
              ) : null}
              <View className="mx-4 mt-2">
                <LookupError query={templates} what="templates" />
              </View>
              {templates.data !== undefined && groups.length === 0 ? (
                <Text className="px-4 py-6 text-center text-sm text-gray-500">No templates found</Text>
              ) : null}
            </>
          }
          renderSectionHeader={renderGroupHeader}
          renderItem={({ item }) => <TemplateRow template={item} onPick={pick} />}
        />
      </View>
    </Modal>
  );
}

type TemplateSection = SectionListData<CannedResponse, { key: string }>;

const templateKey = (t: CannedResponse) => t.id;

const renderGroupHeader = ({ section }: { section: TemplateSection }) => (
  <Text className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500" accessibilityRole="header">
    {section.key}
  </Text>
);

/** Memoised (Phase P): the preview (HTML to one line of text) is computed only when the template changes. */
const TemplateRow = memo(function TemplateRow({ template: t, onPick }: { template: CannedResponse; onPick: (t: CannedResponse) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Inserts this template into your message"
      onPress={() => onPick(t)}
      className="min-h-12 flex-row items-center border-b border-gray-100 px-4 py-3 active:bg-gray-50"
    >
      <View className="flex-1">
        <Text className="text-base text-gray-900" numberOfLines={1}>{t.title}</Text>
        <Text className="text-xs text-gray-500" numberOfLines={1}>{templatePreview(t.body)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
    </Pressable>
  );
});
