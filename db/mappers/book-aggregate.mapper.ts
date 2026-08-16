import type { BookDto, BookSettingsDto, CategoryDto } from '../../shared/models/book.model';
import {
  fromSqliteBoolean,
  fromSqliteTimestamp,
  toIpcBinary,
} from '../core/sqlite-values';
import type { BookRow, BookSettingsRow, BookTagRow, CategoryRow } from '../schema';

export type BookCategoryRow = CategoryRow & Pick<BookTagRow, 'bookId'>;

export interface BookAggregateRows {
  books: BookRow[];
  settings: BookSettingsRow[];
  categories: BookCategoryRow[];
}

export function mapBookAggregate({
  books,
  settings,
  categories,
}: BookAggregateRows): BookDto[] {
  const settingsByBookId = new Map(settings.map((row) => [row.bookSettingId, row]));
  const categoriesByBookId = new Map<string, CategoryDto[]>();

  for (const category of categories) {
    const mappedCategories = categoriesByBookId.get(category.bookId) ?? [];
    mappedCategories.push({
      id: category.id,
      name: category.name,
      type: category.type,
      isCustom: fromSqliteBoolean(category.isCustom),
    });
    categoriesByBookId.set(category.bookId, mappedCategories);
  }

  return books.map((book) => mapBookRow({
    book,
    categories: categoriesByBookId.get(book.id) ?? [],
    settings: settingsByBookId.get(book.id),
  }));
}

function mapBookRow({
  book,
  categories,
  settings,
}: {
  book: BookRow;
  categories: CategoryDto[];
  settings?: BookSettingsRow;
}): BookDto {
  const createdAt = fromSqliteTimestamp(book.createdAt);
  const lastEditedAt = fromSqliteTimestamp(book.lastEditedAt);

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    status: book.status,
    synopsis: book.synopsis,
    language: book.language,
    coverImage: toIpcBinary(book.coverImage),
    wordCount: book.wordCount ?? 0,
    createdAt: (createdAt ?? new Date(0)).toISOString(),
    lastEditedAt: (lastEditedAt ?? new Date(0)).toISOString(),
    categories,
    ...(settings ? { settings: mapBookSettingsRow(settings) } : {}),
  };
}

function mapBookSettingsRow(settings: BookSettingsRow): BookSettingsDto {
  return {
    language: settings.language,
    proseTense: settings.proseTense,
    pointOfView: settings.pointOfView,
    synopsisAiContext: fromSqliteBoolean(settings.synopsisAiContext),
    povCharacterId: settings.povCharacterId,
    embeddingModel: settings.embeddingModel,
    localEmbeddingModel: settings.localEmbeddingModel,
    openRouterEmbeddingModel: settings.openrouterEmbeddingModel,
    vectorSearchEnabled: fromSqliteBoolean(settings.vectorSearchEnabled),
    automaticIndexingEnabled: fromSqliteBoolean(settings.automaticIndexingEnabled),
  };
}
