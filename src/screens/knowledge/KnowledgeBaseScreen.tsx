// M14 Knowledge base (04 §2.1, 08 1.59).
// TODO(Phase B/4) — frontend-only rules to reimplement:
// - Hide categories with isPublic: false (05 B.26). Never send `published` (drafts exposed, 05 C.15).
// - Article list paged via KB-2 (shape a, normalisePage); search via KB-3 only (KB-2 ignores `search`), ≥ 2 chars.
// - Send the Bearer header anyway: KB works without a token only because of C.15, and A7 will add auth.
import type { KnowledgeStackScreenProps } from '@/types';
import { PlaceholderScreen } from '../PlaceholderScreen';

export function KnowledgeBaseScreen({ navigation }: KnowledgeStackScreenProps<'KnowledgeBase'>) {
  return (
    <PlaceholderScreen
      screenId="M14"
      title="Knowledge base"
      headerVariant="drawer"
      visibility="All roles (published, public articles only)."
      endpoints={['KB-1 · GET /kb/categories', 'KB-2 · GET /kb/articles', 'KB-3 · GET /kb/search?q=']}
      actions={[
        { label: 'Open an article → M15', onPress: () => navigation.navigate('KbArticle', { slug: 'placeholder-article' }) },
      ]}
    />
  );
}
