// M15 KB article (04 §2.1).
// TODO(Phase B/4) — frontend-only rules to reimplement:
// - KB-4 is by slug; if `isPublished` is false show "not available" (drafts are reachable by slug).
// - Body through the HTML sanitiser (05 §A.6): sandboxed renderer, JS disabled, links open in the system browser.
// - "Was this helpful?" — KB-5 by id, one vote per article per device (no server de-duplication).
import type { KnowledgeStackScreenProps } from '@/types';
import { PlaceholderScreen } from '../PlaceholderScreen';

export function KbArticleScreen(_props: KnowledgeStackScreenProps<'KbArticle'>) {
  return (
    <PlaceholderScreen
      screenId="M15"
      title="Article"
      headerVariant="back"
      visibility="All roles."
      endpoints={['KB-4 · GET /kb/articles/:slug', 'KB-5 · POST /kb/articles/:id/helpful']}
    />
  );
}
