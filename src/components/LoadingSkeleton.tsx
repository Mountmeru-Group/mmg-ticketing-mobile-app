// First-load placeholders. Each variant mirrors the layout it stands in for — same cards, gutters and line positions
// (docs/brand/UI-STANDARDS.md, S11) — so nothing jumps when the data arrives. Every one shimmers (./Shimmer.tsx).
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Shimmer } from './Shimmer';

interface LoadingSkeletonProps {
  /**
   * Full-width layouts (own cards and top padding):
   * - `list`:          ticket cards (M3).
   * - `approvals`:     approval cards (M12).
   * - `articles`:      knowledge-base article cards (M14, search results too).
   * - `announcements`: announcement cards (M16).
   * - `notifications`: notification cards (M9).
   * - `tasks`:         task rows grouped in one card (standalone task list).
   * - `comments`:      conversation replies (M4 Conversation tab).
   * - `history`:       audit rows grouped in one card (M4 History tab).
   * - `attachments`:   attachment cards (M4 Attachments tab).
   * - `detail`:        header, properties and a text card (M4 and every screen that opens one record).
   * - `article`:       title card and body card (M15).
   * - `formPage`:      a card of labelled fields and the submit button (M5–M8, M11 while their ticket or lookups load).
   * Inline layouts, placed inside a section or card the screen already draws:
   * - `rows`:   compact ticket rows (M2 recent tickets).
   * - `form`:   labelled fields (M10 profile).
   * - `lines`:  a heading and a few text lines (small cards).
   * - `chips`:  one row of filter chips.
   */
  variant?:
    | 'list' | 'approvals' | 'articles' | 'announcements' | 'notifications' | 'tasks' | 'comments' | 'history'
    | 'attachments' | 'detail' | 'article' | 'formPage' | 'rows' | 'form' | 'lines' | 'chips';
  /** Number of placeholder items: cards, rows, fields, text lines or chips. */
  rows?: number;
  /** False when the screen already spaces the content from what is above it (e.g. under M4's tab bar). */
  topGap?: boolean;
}

const INLINE = new Set<NonNullable<LoadingSkeletonProps['variant']>>(['rows', 'form', 'lines', 'chips']);

function Bar({ className }: { className: string }) {
  return <View className={`rounded bg-gray-200 ${className}`} />;
}

/** The standard card (./Card.tsx), empty. */
function Card({ flush = false, children }: { flush?: boolean; children: ReactNode }) {
  return <View className={`mx-4 mb-3 rounded-xl border border-border bg-white ${flush ? 'px-4' : 'p-4'}`}>{children}</View>;
}

/** One shimmering placeholder bar, for a single value inside real layout (e.g. a tile's count). */
export function Skeleton({ className }: { className: string }) {
  return (
    <Shimmer>
      <Bar className={className} />
    </Shimmer>
  );
}

function body(variant: NonNullable<LoadingSkeletonProps['variant']>, rows: number): ReactNode {
  const items = Array.from({ length: rows }, (_, i) => i);
  const divider = (i: number) => (i === rows - 1 ? '' : 'border-b border-border');
  switch (variant) {
    case 'approvals':
      return items.map((i) => (
        <Card key={i}>
          <View className="mb-2 flex-row items-center">
            <Bar className="h-5 w-16 rounded-full" />
            <Bar className="ml-2 h-3 w-14" />
          </View>
          <Bar className="mb-2 h-4 w-3/4" />
          <Bar className="mb-2 h-3 w-1/2" />
          <Bar className="h-3 w-2/5" />
        </Card>
      ));
    case 'articles':
      return items.map((i) => (
        <Card key={i}>
          <Bar className="mb-2 h-3 w-1/4" />
          <Bar className="mb-2 h-4 w-4/5" />
          <Bar className="mb-1.5 h-3 w-full" />
          <Bar className="mb-3 h-3 w-2/3" />
          <Bar className="h-3 w-1/3" />
        </Card>
      ));
    case 'announcements':
      return items.map((i) => (
        <Card key={i}>
          <Bar className="mb-3 h-5 w-20 rounded-full" />
          <Bar className="mb-2 h-4 w-3/4" />
          <Bar className="mb-3 h-3 w-2/5" />
          <Bar className="mb-1.5 h-3 w-full" />
          <Bar className="mb-1.5 h-3 w-full" />
          <Bar className="h-3 w-1/2" />
        </Card>
      ));
    case 'notifications':
      return items.map((i) => (
        <Card key={i}>
          <View className="flex-row">
            <Bar className="mr-3 h-5 w-5 rounded-full" />
            <View className="flex-1">
              <Bar className="mb-2 h-4 w-4/5" />
              <Bar className="mb-2 h-3 w-full" />
              <Bar className="h-3 w-1/4" />
            </View>
          </View>
        </Card>
      ));
    case 'tasks':
      return (
        <Card flush>
          {items.map((i) => (
            <View key={i} className={`flex-row py-3 ${divider(i)}`}>
              <Bar className="mr-3 h-5 w-5 rounded-full" />
              <View className="flex-1">
                <Bar className="mb-2 h-3 w-1/2" />
                <Bar className="mb-2 h-4 w-4/5" />
                <Bar className="h-3 w-2/5" />
              </View>
            </View>
          ))}
        </Card>
      );
    case 'comments':
      return items.map((i) => (
        <Card key={i}>
          <View className="mb-3 flex-row items-center">
            <Bar className="h-8 w-8 rounded-full" />
            <View className="ml-2 flex-1">
              <Bar className="mb-1.5 h-3 w-1/3" />
              <Bar className="h-3 w-1/2" />
            </View>
          </View>
          <Bar className="mb-1.5 h-3 w-full" />
          <Bar className="h-3 w-3/4" />
        </Card>
      ));
    case 'history':
      return (
        <Card flush>
          {items.map((i) => (
            <View key={i} className={`flex-row py-3 ${divider(i)}`}>
              <Bar className="mr-3 mt-1 h-2 w-2 rounded-full" />
              <View className="flex-1">
                <Bar className="mb-2 h-3 w-4/5" />
                <Bar className="h-3 w-1/3" />
              </View>
            </View>
          ))}
        </Card>
      );
    case 'attachments':
      return items.map((i) => (
        <Card key={i}>
          <View className="flex-row items-center">
            <Bar className="h-5 w-5" />
            <View className="ml-3 flex-1">
              <Bar className="mb-2 h-3 w-3/5" />
              <Bar className="h-3 w-2/5" />
            </View>
          </View>
        </Card>
      ));
    case 'detail':
      return (
        <>
          <Card>
            <Bar className="mb-2 h-3 w-1/5" />
            <Bar className="mb-3 h-5 w-4/5" />
            <View className="flex-row">
              <Bar className="mr-1.5 h-5 w-20 rounded-full" />
              <Bar className="mr-1.5 h-5 w-16 rounded-full" />
              <Bar className="h-5 w-24 rounded-full" />
            </View>
          </Card>
          <Card>
            {Array.from({ length: 5 }, (_, i) => (
              <View key={i} className="flex-row justify-between py-2">
                <Bar className="h-3 w-1/4" />
                <Bar className="h-3 w-2/5" />
              </View>
            ))}
          </Card>
          <Card>
            <Bar className="mb-3 h-3 w-1/3" />
            <Bar className="mb-2 h-3 w-full" />
            <Bar className="h-3 w-2/3" />
          </Card>
        </>
      );
    case 'article':
      return (
        <>
          <Card>
            <Bar className="mb-2 h-3 w-1/4" />
            <Bar className="mb-2 h-5 w-4/5" />
            <Bar className="h-3 w-1/2" />
          </Card>
          <Card>
            {Array.from({ length: 7 }, (_, i) => (
              <Bar key={i} className={`mb-2 h-3 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
            ))}
          </Card>
        </>
      );
    case 'formPage':
      return (
        <>
          <Card>{body('form', rows)}</Card>
          <View className="mx-4">
            <Bar className="h-12 w-full rounded-lg" />
          </View>
        </>
      );
    case 'rows':
      return items.map((i) => (
        <View key={i} className={`py-3 ${divider(i)}`}>
          <View className="flex-row">
            <Bar className="h-3 w-12" />
            <Bar className="ml-2 h-3 w-24" />
          </View>
          <Bar className="mt-1.5 h-4 w-4/5" />
          <View className="mt-2 flex-row">
            <Bar className="mr-1.5 h-5 w-16 rounded-full" />
            <Bar className="mr-1.5 h-5 w-14 rounded-full" />
            <Bar className="h-5 w-20 rounded-full" />
          </View>
          <Bar className="mt-2 h-3 w-1/2" />
        </View>
      ));
    case 'form':
      return items.map((i) => (
        <View key={i} className="mb-3">
          <Bar className="mb-1.5 h-3 w-24" />
          <Bar className="h-11 w-full rounded-lg" />
        </View>
      ));
    case 'lines':
      return (
        <View>
          <Bar className="mb-2 h-3 w-1/5" />
          <Bar className="mb-3 h-4 w-4/5" />
          {items.map((i) => (
            <Bar key={i} className={`mb-2 h-3 ${i === rows - 1 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </View>
      );
    case 'chips':
      return (
        <View className="flex-row gap-2">
          {items.map((i) => (
            <Bar key={i} className={`h-9 rounded-full ${i % 2 === 0 ? 'w-20' : 'w-28'}`} />
          ))}
        </View>
      );
    default:
      // `list`: TicketCard — number and time, title, three badges, people line.
      return items.map((i) => (
        <Card key={i}>
          <Bar className="mb-2 h-3 w-1/4" />
          <Bar className="mb-1 h-4 w-3/4" />
          <View className="mt-2 flex-row">
            <Bar className="mr-1.5 h-5 w-16 rounded-full" />
            <Bar className="mr-1.5 h-5 w-14 rounded-full" />
            <Bar className="h-5 w-20 rounded-full" />
          </View>
          <Bar className="mt-2 h-3 w-1/2" />
        </Card>
      ));
  }
}

export function LoadingSkeleton({ variant = 'list', rows = 4, topGap = true }: LoadingSkeletonProps) {
  // Full-width layouts start 12 dp below the bars above them, like the lists they stand in for.
  return <Shimmer paddingTop={INLINE.has(variant) || !topGap ? 0 : 12}>{body(variant, rows)}</Shimmer>;
}
