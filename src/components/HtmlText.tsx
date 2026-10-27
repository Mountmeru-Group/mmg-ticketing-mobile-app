// Ticket descriptions and comment bodies (server HTML), rendered with react-native-render-html (05 §A.6).
// - Input always passes sanitizeForRender() first: blocked elements removed, only inline base64 raster images
//   kept, so no remote request is ever made by the renderer. Output is native views — no WebView, no script.
// - Links open in the system browser, and only for http(s) and mailto — except a ticket link to THIS environment
//   (…/ticket/<n>, …/tickets/<uuid or n>), which opens the ticket in the app (deep-link resolver, 05 §A.11).
// - If the renderer throws, the body falls back to plain text (htmlToDisplayText), never to a blank card.
// One renderer for every server HTML body: ticket descriptions, comments, KB articles, announcements.
import { useRecyclingState } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Component, memo, useMemo, type ComponentProps, type ReactNode } from 'react';
import { Linking, Pressable, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import {
  IMGElementContainer, IMGElementContentError, IMGElementContentLoading, RenderHTMLConfigProvider, RenderHTMLSource,
  TRenderEngineProvider, defaultFallbackFonts, defaultSystemFonts, useIMGElementProps, useIMGElementState,
  type CustomBlockRenderer, type MixedStyleDeclaration, type MixedStyleRecord, type RenderersProps,
} from 'react-native-render-html';

import { openTicketLinkInApp } from '@/navigation/navigationRef';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette } from '@/theme';
import { parseTicketLink } from '@/utils/deep-links';
import { BLOCKED_TAGS, clearPreparedHtml, prepareHtmlBody } from '@/utils/html';

// Prepared bodies (utils/html.ts) and expo-image's caches (inline images, attachments opened in ImageViewerModal) are
// ticket content: drop them when the session ends, as the query cache is dropped.
useAuthStore.subscribe((state, previous) => {
  if (!previous.isAuthenticated || state.isAuthenticated) return;
  clearPreparedHtml();
  Image.clearMemoryCache().catch(() => undefined);
  Image.clearDiskCache().catch(() => undefined);
});

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
 * Inline images (base64 rasters only: the sanitiser drops every other image) through expo-image (Phase P2), which
 * decodes at the size shown instead of the picture's full size (docs/PERFORMANCE.md §4 item 2). Everything else is the
 * library's own IMGElement: the same sizing, loading and error states; its success view was <Image> with
 * `resizeMode: 'cover'`.
 */
const ImgRenderer: CustomBlockRenderer = (props) => {
  const imgProps = useIMGElementProps(props);
  const state = useIMGElementState(imgProps);
  let content: ReactNode;
  if (state.type === 'success') {
    content = (
      <Image
        source={state.source}
        contentFit="cover"
        style={[state.dimensions, state.imageStyle]}
        onError={(e) => state.onError(new Error(e.error))}
      />
    );
  } else if (state.type === 'loading') {
    content = <IMGElementContentLoading {...state} />;
  } else {
    content = <IMGElementContentError {...state} />;
  }
  return (
    <IMGElementContainer {...imgProps.containerProps} onPress={imgProps.onPress} style={state.containerStyle}>
      {content}
    </IMGElementContainer>
  );
};

const RENDERERS = { img: ImgRenderer };

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
        renderers={RENDERERS}
        renderersProps={RENDERERS_PROPS}
        enableExperimentalBRCollapsing
        enableExperimentalGhostLinesPrevention
      >
        {children}
      </RenderHTMLConfigProvider>
    </TRenderEngineProvider>
  );
}

interface BoundaryProps {
  fallback: ReactNode;
  /** The body shown. A recycled list cell gets another body, and a failure belongs to the body it happened on. */
  resetKey: string;
  children: ReactNode;
}

class RendererBoundary extends Component<BoundaryProps, { failed: boolean; resetKey: string }> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: { failed: boolean; resetKey: string }) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
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

interface HtmlTextProps {
  html: string | null | undefined;
  /** Bodies taller than this collapse behind "Show more". */
  collapsedHeight?: number;
  /** Horizontal space around the text on screen (card margins, borders and padding), for image sizing. */
  horizontalInset?: number;
  emptyText?: string;
  /**
   * "Show more" held by the caller (Phase P). A virtualised list can unmount a row that scrolled far away; with the
   * state in the screen, an expanded body is still expanded when the row comes back. Omit both to keep it here.
   */
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

// Default inset: the standard card (Card.tsx) — 16 dp margin, 1 dp border and 16 dp padding on each side.
function HtmlTextImpl({
  html, collapsedHeight = 280, horizontalInset = 66, emptyText = 'No text', expanded: expandedProp, onToggleExpanded,
}: HtmlTextProps) {
  // Cached (Phase P2): a recycled cell or a reopened ticket does not redo the sanitiser for a body it has seen.
  const prepared = useMemo(() => prepareHtmlBody(html), [html]);
  const source = useMemo(() => (prepared.kind === 'html' ? { html: prepared.html } : null), [prepared]);
  const { width } = useWindowDimensions();
  // Both reset when the body changes (Phase P2): FlashList hands a recycled cell another reply or announcement, which
  // must start collapsed and unmeasured, as a newly mounted one did.
  const [expandedState, setExpandedState] = useRecyclingState(false, [html]);
  const [contentHeight, setContentHeight] = useRecyclingState(0, [html]);
  const expanded = expandedProp ?? expandedState;
  const toggle = onToggleExpanded ?? (() => setExpandedState((v) => !v));

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
      <RendererBoundary fallback={plain(prepared.fallbackText)} resetKey={prepared.html}>
        <RenderHTMLSource source={source ?? { html: prepared.html }} contentWidth={Math.max(width - horizontalInset, 120)} />
      </RendererBoundary>
    );
  const threshold = collapsedHeight + 40;
  const collapsible = contentHeight > threshold;
  // Until the body is measured, it is held to the threshold (Phase P): anything that fits still shows in full, and a
  // long email no longer lays out at full height for a frame only to collapse — on a slow phone that is a visible
  // jump and a second layout of the whole list. The inner view still measures its full height (it is clipped, not
  // shrunk), so the result after measuring is the same as before.
  const clamp = expanded ? undefined : contentHeight === 0 ? threshold : collapsible ? collapsedHeight : undefined;

  return (
    <View>
      <View style={clamp !== undefined ? { maxHeight: clamp, overflow: 'hidden' } : undefined}>
        <View onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}>{body}</View>
      </View>
      {collapsible ? (
        <Pressable accessibilityRole="button" onPress={toggle} className="min-h-11 justify-center self-start active:opacity-60">
          <Text className="text-sm font-medium text-blue-700">{expanded ? 'Show less' : 'Show more'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Memoised (Phase P): a parent re-render with the same body does not re-run the snippet's render. */
export const HtmlText = memo(HtmlTextImpl);
