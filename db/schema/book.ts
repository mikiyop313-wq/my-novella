import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type { CategoryDto, BookSettingsDto } from '../../shared/models/book.model';
import type {
  EmbeddingModel,
  LocalEmbeddingModelName,
  OpenRouterEmbeddingModelName,
} from '../../shared/models/vector.model';
import type { SqliteBoolean, SqliteTimestamp } from '../core/sqlite-values';

export interface BookTable {
  id: string;
  title: string;
  author: string;
  status: Generated<'archived' | 'draft'>;
  synopsis: Generated<string | null>;
  language: Generated<string>;
  coverImage: Generated<Buffer | null>;
  wordCount: Generated<number | null>;
  createdAt: Generated<SqliteTimestamp | null>;
  lastEditedAt: Generated<SqliteTimestamp | null>;
}

export interface LanguageTable {
  languageName: string;
}

export interface BookSettingsTable {
  bookSettingId: string;
  language: Generated<string>;
  proseTense: Generated<BookSettingsDto['proseTense']>;
  pointOfView: Generated<BookSettingsDto['pointOfView']>;
  synopsisAiContext: Generated<SqliteBoolean>;
  povCharacterId: Generated<string | null>;
  embeddingModel: Generated<EmbeddingModel | null>;
  localEmbeddingModel: Generated<LocalEmbeddingModelName | null>;
  openrouterEmbeddingModel: Generated<OpenRouterEmbeddingModelName | null>;
  vectorSearchEnabled: Generated<SqliteBoolean>;
  automaticIndexingEnabled: Generated<SqliteBoolean>;
}

export interface CategoryTable {
  id: string;
  name: string;
  type: CategoryDto['type'];
  isCustom: Generated<SqliteBoolean>;
}

export interface SubcategoryTable {
  id: string;
  name: string;
  isCustom: Generated<SqliteBoolean>;
  parentCategoryId: string;
}

export interface BookTagTable {
  bookId: string;
  categoryId: string;
}

export type BookRow = Selectable<BookTable>;
export type NewBookRow = Insertable<BookTable>;
export type BookUpdate = Updateable<BookTable>;
export type LanguageRow = Selectable<LanguageTable>;
export type NewLanguageRow = Insertable<LanguageTable>;
export type BookSettingsRow = Selectable<BookSettingsTable>;
export type NewBookSettingsRow = Insertable<BookSettingsTable>;
export type BookSettingsUpdate = Updateable<BookSettingsTable>;
export type CategoryRow = Selectable<CategoryTable>;
export type NewCategoryRow = Insertable<CategoryTable>;
export type SubcategoryRow = Selectable<SubcategoryTable>;
export type NewSubcategoryRow = Insertable<SubcategoryTable>;
export type BookTagRow = Selectable<BookTagTable>;
export type NewBookTagRow = Insertable<BookTagTable>;
