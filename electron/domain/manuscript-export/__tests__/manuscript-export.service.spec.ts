import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../db/repositories/book.repository', () => ({
  bookRepository: {},
}));
vi.mock('../../../../db/repositories/manuscript.repository', () => ({
  manuscriptRepository: {},
}));

import type { BookDto } from '../../../../shared/models/book.model';
import type {
  ActDto,
  ChapterDto,
  ManuscriptDataDto,
  ManuscriptMode,
  SceneDto,
  TiptapJsonDoc,
} from '../../../../shared/models/manuscript.model';
import { ManuscriptExportService } from '../manuscript-export.service';

const prose: TiptapJsonDoc = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{ type: 'text', text: 'Opening prose.', marks: [{ type: 'italic' }] }],
  }],
};

const sceneOne: SceneDto = {
  id: 'scene-1',
  title: 'Arrival',
  chapterId: 'chapter-1',
  position: 0,
  status: 'active',
  prose,
  summary: 'Excluded scene summary',
  wordCount: 2,
  pointOfViewOverride: null,
  povCharacterIdOverride: null,
  includeInContext: false,
  isIncludedInContext: false,
};

const sceneTwo: SceneDto = {
  ...sceneOne,
  id: 'scene-2',
  title: '',
  position: 1,
  prose: null,
};

const chapterOne: ChapterDto = {
  id: 'chapter-1',
  title: 'Beginnings',
  actId: 'act-1',
  position: 0,
  status: 'active',
  summary: 'Excluded chapter summary',
  scenes: [sceneOne, sceneTwo],
  isIncludedInContext: false,
};

const actOne: ActDto = {
  id: 'act-1',
  title: '',
  bookId: 'book-1',
  position: 0,
  status: 'active',
  summary: 'Excluded act summary',
  chapters: [chapterOne],
  isIncludedInContext: false,
};

const actTwo: ActDto = {
  ...actOne,
  id: 'act-2',
  title: 'Resolution',
  position: 1,
  chapters: [],
};

const book: BookDto = {
  id: 'book-1',
  title: 'The Book',
  author: 'A. Writer',
  status: 'draft',
  synopsis: 'Excluded synopsis',
  coverImage: null,
  wordCount: 2,
  language: 'english',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastEditedAt: '2026-01-01T00:00:00.000Z',
  categories: [],
};

describe('ManuscriptExportService', () => {
  it('prepares a normalized book subtree in repository order', async () => {
    const { service } = createService([actOne, actTwo]);

    const result = await service.prepareExport({ mode: 'book', id: book.id });

    expect(result).toEqual({
      target: { mode: 'book', id: 'book-1' },
      book: { id: 'book-1', title: 'The Book', author: 'A. Writer' },
      nodes: [
        {
          type: 'act',
          id: 'act-1',
          number: 1,
          title: null,
          chapters: [{
            type: 'chapter',
            id: 'chapter-1',
            number: 1,
            title: 'Beginnings',
            scenes: [
              {
                type: 'scene',
                id: 'scene-1',
                number: 1,
                title: 'Arrival',
                prose,
              },
              {
                type: 'scene',
                id: 'scene-2',
                number: 2,
                title: null,
                prose: { type: 'doc', content: [] },
              },
            ],
          }],
        },
        {
          type: 'act',
          id: 'act-2',
          number: 2,
          title: 'Resolution',
          chapters: [],
        },
      ],
    });
    expect(result.nodes[0]).not.toHaveProperty('summary');
    expect(result.book).not.toHaveProperty('synopsis');
    expect(result.book).not.toHaveProperty('coverImage');
  });

  it.each([
    ['act', 'act-1', actOne, 'act'],
    ['chapter', 'chapter-1', chapterOne, 'chapter'],
    ['scene', 'scene-1', sceneOne, 'scene'],
  ] as const)(
    'prepares only the selected %s subtree and includes book metadata',
    async (mode, id, manuscript, expectedType) => {
      const { service } = createService(manuscript);

      const result = await service.prepareExport({ mode, id });

      expect(result.target).toEqual({ mode, id });
      expect(result.book).toEqual({ id: 'book-1', title: 'The Book', author: 'A. Writer' });
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]?.type).toBe(expectedType);
    },
  );

  it('preserves existing Tiptap prose without changing its formatting', async () => {
    const { service } = createService(sceneOne);

    const result = await service.prepareExport({ mode: 'scene', id: sceneOne.id });

    expect(result.nodes[0]).toMatchObject({ type: 'scene', prose });
    if (result.nodes[0]?.type === 'scene') {
      expect(result.nodes[0].prose).toBe(prose);
    }
  });

  it('rejects a target whose owning book cannot be resolved', async () => {
    const { service, manuscripts, books } = createService(undefined);
    manuscripts.getBookIdForTarget.mockResolvedValue(undefined);

    await expect(service.prepareExport({ mode: 'scene', id: 'missing' })).rejects.toThrow(
      'Manuscript export target not found or unavailable: scene "missing".',
    );
    expect(books.getById).not.toHaveBeenCalled();
    expect(manuscripts.getManuscript).not.toHaveBeenCalled();
  });

  it('rejects a missing or archived manuscript path', async () => {
    const { service } = createService(undefined);

    await expect(service.prepareExport({ mode: 'chapter', id: 'archived' })).rejects.toThrow(
      'Manuscript export target not found or unavailable: chapter "archived".',
    );
  });

  it('rejects a target when its book no longer exists', async () => {
    const { service, books } = createService(sceneOne);
    books.getById.mockResolvedValue(undefined);

    await expect(service.prepareExport({ mode: 'scene', id: sceneOne.id })).rejects.toThrow(
      'Manuscript export target not found or unavailable: scene "scene-1".',
    );
  });
});

function createService(manuscript: ManuscriptDataDto | undefined): {
  service: ManuscriptExportService;
  manuscripts: {
    getBookIdForTarget: ReturnType<typeof vi.fn>;
    getManuscript: ReturnType<typeof vi.fn>;
  };
  books: { getById: ReturnType<typeof vi.fn> };
} {
  const manuscripts = {
    getBookIdForTarget: vi.fn<(mode: ManuscriptMode, id: string) => Promise<string | undefined>>()
      .mockResolvedValue(book.id),
    getManuscript: vi.fn<(mode: ManuscriptMode, id: string) => Promise<ManuscriptDataDto>>()
      .mockResolvedValue(manuscript as ManuscriptDataDto),
  };
  const books = {
    getById: vi.fn<(id: string) => Promise<BookDto | undefined>>().mockResolvedValue(book),
  };
  const service = new ManuscriptExportService({
    manuscriptRepository: manuscripts,
    bookRepository: books,
  });

  return { service, manuscripts, books };
}
