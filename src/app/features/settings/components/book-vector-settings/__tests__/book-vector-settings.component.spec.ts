import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookDto, UpdateBookDto } from '../../../../../../../shared/models/book.model';
import type {
  BookEmbeddingReindexProgress,
  LocalEmbeddingModelName,
  LocalEmbeddingModelStatus,
} from '../../../../../../../shared/models/vector.model';
import { ElectronService } from '../../../../../core/services/electron.service';
import { LibraryService } from '../../../../library/services/library.service';
import { BookVectorSettingsComponent } from '../book-vector-settings.component';

describe('BookVectorSettingsComponent', () => {
  const unavailableModel = model(
    'mixedbread-ai/mxbai-embed-large-v1',
    'Mixedbread Large',
    false,
  );
  const installedModel = model('BAAI/bge-m3', 'BGE-M3', true);
  const hiddenModel = model('BAAI/bge-large-en-v1.5', 'BGE Large', false);

  let fixture: ComponentFixture<BookVectorSettingsComponent>;
  let invoke: ReturnType<typeof vi.fn>;
  let updateBook: ReturnType<typeof vi.fn>;
  let listeners: Map<string, (payload: unknown) => void>;

  beforeEach(async () => {
    listeners = new Map();
    updateBook = vi.fn(async (_id: string, update: UpdateBookDto) => ({
      ...book(),
      ...update,
    }));
    invoke = vi.fn(async (channel: string, payload?: Record<string, unknown>) => {
      if (channel === 'vectors:local-model:get-status') {
        return [unavailableModel, installedModel, hiddenModel];
      }
      if (channel === 'vectors:local-model:get-book-selection') {
        return {
          bookId: 'book-1',
          modelName: 'mixedbread-ai/mxbai-embed-large-v1',
        };
      }
      if (channel === 'vectors:local-model:select-for-book') {
        if (payload?.['reindex']) {
          listeners.get('vectors:local-model:reindex-progress')?.({
            bookId: 'book-1',
            modelName: payload['modelName'] as LocalEmbeddingModelName,
            processedParagraphs: 2,
            totalParagraphs: 4,
          } satisfies BookEmbeddingReindexProgress);
        }
        return {
          bookId: 'book-1',
          modelName: payload?.['modelName'],
          reindexed: Boolean(payload?.['reindex']),
        };
      }
      return undefined;
    });

    await TestBed.configureTestingModule({
      imports: [BookVectorSettingsComponent],
      providers: [
        {
          provide: ElectronService,
          useValue: {
            invoke,
            on: vi.fn((channel: string, listener: (payload: unknown) => void) => {
              listeners.set(channel, listener);
              return () => listeners.delete(channel);
            }),
            onBeforeClose: vi.fn(),
            removeBeforeCloseHandler: vi.fn(),
          },
        },
        { provide: LibraryService, useValue: { updateBook } },
      ],
    }).compileComponents();
  });

  it('shows only installed models plus the unavailable selected model', async () => {
    await create(book());

    const element = fixture.nativeElement as HTMLElement;
    const options = element.querySelectorAll<HTMLButtonElement>('.model-option');
    const indexingSwitch = element.querySelector<HTMLButtonElement>('.indexing-switch');

    expect(options).toHaveLength(2);
    expect(modelOption(unavailableModel.modelName).disabled).toBe(true);
    expect(modelOption(hiddenModel.modelName, false)).toBeNull();
    expect(element.textContent).toContain('General Settings → Vector Search');
    expect(indexingSwitch?.disabled).toBe(true);
    expect(indexingSwitch?.getAttribute('aria-checked')).toBe('false');
  });

  it('reindexes an enabled book and immediately removes its old unavailable model', async () => {
    await create(book());

    await fixture.componentInstance.selectModel(installedModel);
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith('vectors:local-model:select-for-book', {
      bookId: 'book-1',
      modelName: installedModel.modelName,
      reindex: true,
    });
    expect(modelOption(unavailableModel.modelName, false)).toBeNull();
    expect(modelOption(installedModel.modelName).getAttribute('aria-checked')).toBe('true');
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.indexing-switch')
        ?.getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('changes models without reindexing when the saved preference is disabled', async () => {
    await create(book(false));

    await fixture.componentInstance.selectModel(installedModel);

    expect(invoke).toHaveBeenCalledWith('vectors:local-model:select-for-book', {
      bookId: 'book-1',
      modelName: installedModel.modelName,
      reindex: false,
    });
  });

  it('reconciles before enabling indexing and persists the enabled preference', async () => {
    const selectedInstalledBook = book(false, installedModel.modelName);
    invoke.mockImplementation(async (channel: string, payload?: Record<string, unknown>) => {
      if (channel === 'vectors:local-model:get-status') return [installedModel];
      if (channel === 'vectors:local-model:get-book-selection') {
        return { bookId: 'book-1', modelName: installedModel.modelName };
      }
      if (channel === 'vectors:local-model:select-for-book') {
        return { bookId: 'book-1', modelName: payload?.['modelName'], reindexed: true };
      }
      return undefined;
    });
    await create(selectedInstalledBook);

    await fixture.componentInstance.toggleIndexing();

    expect(invoke).toHaveBeenCalledWith('vectors:local-model:select-for-book', {
      bookId: 'book-1',
      modelName: installedModel.modelName,
      reindex: true,
    });
    expect(updateBook).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({
        settings: expect.objectContaining({ vectorSearchEnabled: true }),
      }),
    );
  });

  async function create(inputBook: BookDto): Promise<void> {
    fixture = TestBed.createComponent(BookVectorSettingsComponent);
    fixture.componentRef.setInput('book', inputBook);
    fixture.detectChanges();
    await fixture.componentInstance.load();
    fixture.detectChanges();
  }

  function modelOption(
    modelName: string,
    required?: true,
  ): HTMLButtonElement;
  function modelOption(
    modelName: string,
    required: false,
  ): HTMLButtonElement | null;
  function modelOption(modelName: string, required = true): HTMLButtonElement | null {
    const option = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      `[data-model="${modelName}"]`,
    );
    if (required && !option) throw new Error(`Expected model option: ${modelName}`);
    return option;
  }
});

function book(
  vectorSearchEnabled = true,
  localEmbeddingModel: LocalEmbeddingModelName = 'mixedbread-ai/mxbai-embed-large-v1',
): BookDto {
  return {
    id: 'book-1',
    title: 'Book',
    author: 'Author',
    status: 'draft',
    synopsis: null,
    coverImage: null,
    wordCount: 0,
    language: 'english',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    settings: {
      language: 'english',
      proseTense: 'past',
      pointOfView: 'third_limited',
      synopsisAiContext: false,
      embeddingModel: 'local',
      localEmbeddingModel,
      vectorSearchEnabled,
    },
  };
}

function model(
  modelName: LocalEmbeddingModelStatus['modelName'],
  displayName: string,
  installed: boolean,
): LocalEmbeddingModelStatus {
  return {
    modelName,
    displayName,
    providerName: 'Provider',
    providerInitials: 'PR',
    tier: 'large',
    dimensions: 1024,
    language: 'English',
    installed,
    cachedBytes: installed ? 1024 : 0,
    selectedBookCount: modelName === 'mixedbread-ai/mxbai-embed-large-v1' ? 1 : 0,
  };
}
