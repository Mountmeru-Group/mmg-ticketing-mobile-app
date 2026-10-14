// Copied verbatim from 03-DATA-MODEL.md §C ("Phase 2" → KB interfaces). Do not edit by hand.
// The knowledge base moved into the MVP (04 M14/M15); 03 still files the interfaces under "Phase 2".
import type { ISODateString, UUID } from './api';

export interface KBCategory {
  id: UUID; name: string; description: string | null; parentId: UUID | null; sortOrder: number;
  isPublic: boolean; createdAt: ISODateString; children?: KBCategory[];
}
export interface KBArticleListItem {
  id: UUID; title: string; slug: string; excerpt: string | null; tags: string[];
  viewCount: number; helpfulCount: number; isPublished: boolean; isPublic: boolean;
  publishedAt: ISODateString | null;
  author: { displayName: string }; category: { name: string } | null;
}
export interface KBSearchResult { id: UUID; title: string; slug: string; excerpt: string | null; tags: string[]; }
export interface KBArticle {
  id: UUID; title: string; slug: string; body: string /* HTML */; excerpt: string | null;
  categoryId: UUID | null; authorId: UUID; tags: string[]; isPublished: boolean; isPublic: boolean;
  viewCount: number; helpfulCount: number; publishedAt: ISODateString | null;
  createdAt: ISODateString; updatedAt: ISODateString; ticketCategoryId: UUID | null;
  author: { displayName: string }; category: { name: string } | null;
}
