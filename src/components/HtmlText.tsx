// Ticket descriptions and comment bodies (server HTML), rendered with react-native-render-html (05 §A.6).
// - Input always passes sanitizeForRender() first: blocked elements removed, only inline base64 raster images
//   kept, so no remote request is ever made by the renderer. Output is native views — no WebView, no script.
// - Links open in the system browser, and only for http(s) and mailto — except a ticket link to THIS environment
//   (…/ticket/<n>, …/tickets/<uuid or n>), which opens the ticket in the app (deep-link resolver, 05 §A.11).
// - If the renderer throws, the body falls back to plain text (htmlToDisplayText), never to a blank card.
// One renderer for every server HTML body: ticket descriptions, comments, KB articles, announcements.
import { Component, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Linking, Pressable, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import {
  RenderHTMLConfigProvider, RenderHTMLSource, TRenderEngineProvider, defaultFallbackFonts, defaultSystemFonts,
  type MixedStyleDeclaration, type MixedStyleRecord, type RenderersProps,
} from 'react-native-render-html';

import { openTicketLinkInApp } from '@/navigation/navigationRef';
import { colors, palette } from '@/theme';
import { parseTicketLink } from '@/utils/deep-links';
import { BLOCKED_TAGS, htmlToDisplayText, looksLikeHtml, sanitizeForRender } from '@/utils/html';

// ── App-wide renderer setup (one engine shared by every snippet: RenderHTMLSource pattern) ──

// `text-sm` body text (14/20 dp, colors.text.body), the same as every other paragraph in the app.
const BASE_STYLE: MixedStyleDeclaration = { fontSize: 14, lineHeight: 20, color: colors.text.body };

const TAGS_STYLES: MixedStyleRecord = {
  body: { margin: 0, padding: 0 },
  p: { marginTop: 0, marginBottom: 8 },
  a: { color: palette.blue[700], textDecorationLine: 'underline' },
  h1: { fontSize: 18, marginTop: 4, marginBottom: 8 },
  h2: { fontSize: 17, marginTop: 4, marginBottom: 8 },
  h3: { fontSize: 16, marginTop: 4, marginBottom: 6 },
  h4: { fontSize: 15, marginTop: 4, marginBottom: 6 },
  blockquote: { marginLeft: 0, marginRight: 0, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: palette.gray[300], color: palette.gray[600] },
  pre: { fontSize: 12 },
  code: { fontSize: 12 },
  ul: { marginTop: 0, marginBottom: 8 },
  ol: { marginTop: 0, marginBottom: 8 },
};

/**
 * Inline CSS kept from server HTML. Everything else (colours, fonts, sizes, widths) is dropped: email HTML often
 * sets white text, fixed widths or tiny fonts that would make a card unreadable or overflow it.
 */
const ALLOWED_STYLES: NonNullable<ComponentProps<typeof TRenderEngineProvider>['allowedStyles']> = [
  'fontWeight', 'fontStyle', 'textDecorationLine', 'textAlign',
];

function openLink(_event: GestureResponderEvent, href: string) {
  const url = href.trim();
  if (!/^(https?:|mailto:)/i.test(url)) return; // javascript:, data:, relative and app links are never opened
  if (/^https?:/i.test(url) && parseTicketLink(url).ok && openTicketLinkInApp(url)) return;
  Linking.openURL(url).catch(() => undefined);
}

const RENDERERS_PROPS: Partial<RenderersProps> = { a: { onPress: openLink } };

/**
 * Wrap the app once (App.tsx). Every TRenderEngineProvider option is passed explicitly: react-native-render-html
 * 6.3.4 declares these defaults through `defaultProps` on a function component, which React 19 ignores.
 * Values not customised here are the library's own defaults (TRenderEngineProvider.tsx).
 */
export function HtmlRenderProvider({ children }: { children: ReactNode }) {
  return (
    <TRenderEngineProvider
      htmlParserOptions={{ decodeEntities: true }}
      emSize={14}
      ignoredDomTags={[...BLOCKED_TAGS]}
      ignoredStyles={[]}
      allowedStyles={ALLOWED_STYLES}
      baseStyle={BASE_STYLE}
      tagsStyles={TAGS_STYLES}
      classesStyles={{}}
      enableUserAgentStyles
      enableCSSInlineProcessing
      customHTMLElementModels={{}}
      fallbackFonts={defaultFallbackFonts}
      systemFonts={defaultSystemFonts}
    >
      <RenderHTMLConfigProvider
        defaultTextProps={{ selectable: true }}
        renderersProps={RENDERERS_PROPS}
        enableExperimentalBRCollapsing
        enableExperimentalGhostLinesPrevention
      >
        {children}
      </RenderHTMLConfigProvider>
    </TRenderEngineProvider>
  );
}

class RendererBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Error name only: messages can quote the HTML, i.e. ticket content.
    if (__DEV__) console.warn(`[HtmlText] renderer failed (${error.name}); showing plain text instead`);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// ── One snippet ──────────────────────────────────────────────

type Prepared =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'html'; html: string; fallbackText: string };

function prepare(input: string | null | undefined): Prepared {
  if (!input || !input.trim()) return { kind: 'empty' };
  if (!looksLikeHtml(input)) return { kind: 'text', text: input.replace(/\r\n?/g, '\n').trim() };
  const html = sanitizeForRender(input);
  const fallbackText = htmlToDisplayText(input);
  if (!fallbackText && !/<img\b/i.test(html)) return { kind: 'empty' };
  return { kind: 'html', html, fallbackText };
}

interface HtmlTextProps {
  html: string | null | undefined;
  /** Bodies taller than this collapse behind "Show more". */
  collapsedHeight?: number;
  /** Horizontal space around the text on screen (card margins, borders and padding), for image sizing. */
  horizontalInset?: number;
  emptyText?: string;
}

// Default inset: the standard card (Card.tsx) — 16 dp margin, 1 dp border and 16 dp padding on each side.
export function HtmlText({ html, collapsedHeight = 280, horizontalInset = 66, emptyText = 'No text' }: HtmlTextProps) {
  const prepared = useMemo(() => prepare(html), [html]);
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);

  if (prepared.kind === 'empty') return <Text className="text-sm italic text-gray-500">{emptyText}</Text>;

  const plain = (text: string) => (
    <Text selectable className="text-sm leading-5 text-gray-700">
      {text}
    </Text>
  );
  const body =
    prepared.kind === 'text' ? (
      plain(prepared.text)
    ) : (
      <RendererBoundary fallback={plain(prepared.fallbackText)}>
        <RenderHTMLSource source={{ html: prepared.html }} contentWidth={Math.max(width - horizontalInset, 120)} />
      </RendererBoundary>
    );
  const collapsible = contentHeight > collapsedHeight + 40;

  return (
    <View>
      <View style={collapsible && !expanded ? { maxHeight: collapsedHeight, overflow: 'hidden' } : undefined}>
        <View onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}>{body}</View>
      </View>
      {collapsible ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded((v) => !v)} className="min-h-11 justify-center self-start">
          <Text className="text-sm font-medium text-blue-700">{expanded ? 'Show less' : 'Show more'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
