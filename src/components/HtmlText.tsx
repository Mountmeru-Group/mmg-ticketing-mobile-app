// Ticket descriptions and comment bodies (server HTML) shown as plain text (05 §A.6).
// htmlToDisplayText() sanitises with the web's rules and then drops every tag, so no markup, script, link or
// remote image ever reaches the screen. There is no WebView in this app.
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { htmlToDisplayText } from '@/utils/html';

interface HtmlTextProps {
  html: string | null | undefined;
  /** Collapse long bodies to this many lines with a "Show more" toggle. */
  collapsedLines?: number;
  emptyText?: string;
}

const LONG_TEXT_CHARS = 600;

export function HtmlText({ html, collapsedLines = 12, emptyText = 'No text' }: HtmlTextProps) {
  const text = useMemo(() => htmlToDisplayText(html), [html]);
  const [expanded, setExpanded] = useState(false);

  if (!text) return <Text className="text-sm italic text-gray-400">{emptyText}</Text>;

  const lineCount = text.split('\n').length;
  const long = text.length > LONG_TEXT_CHARS || lineCount > collapsedLines;

  return (
    <View>
      <Text selectable className="text-sm leading-5 text-gray-800" numberOfLines={long && !expanded ? collapsedLines : undefined}>
        {text}
      </Text>
      {long ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded((v) => !v)} hitSlop={6} className="mt-1 self-start">
          <Text className="text-sm font-medium text-blue-700">{expanded ? 'Show less' : 'Show more'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
