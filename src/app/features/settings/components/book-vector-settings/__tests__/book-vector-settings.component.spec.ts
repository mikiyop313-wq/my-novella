import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookDto, UpdateBookDto } from '../../../../../../../shared/models/book.model';
import type {
  BookEmbeddingReindexProgress,
  LocalEmbeddingModelName,
  LocalEmbeddingModelStatus,
} from '../../../../../../../shared/models/vector.model';
import { ElectronService } from '../../../../../core/services/electron.service';
import { ConfirmModalService } from '../../../../../shared/components/confirm-modal/confirm-modal.service';
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
  const openRouterModel = {
    modelName: 'openai/text-embedding-3-small' as const,
    displayName: 'Text Embedding 3 Small',
    providerName: 'OpenAI',
    dimensions: 1536,
  };

  let fixture: ComponentFixture<BookVectorSettingsComponent>;
  let invoke: ReturnType<typeof vi.fn>;
  let updateBook: ReturnType<typeof vi.fn>;
  let listeners: Map<string, (payload: unknown) => void>;
  let retainedIndexSizes: Array<{
    provider: 'local' | 'openAI' | 'voyage' | 'openRouter';
    model: string;
    paragraphCount: number;
    estimatedBytes: number;
  }>;

  beforeEach(async () => {
    listeners = new Map();
    retainedIndexSizes = [{
      provider: 'local',
      model: unavailableModel.modelName,
      paragraphCount: 4,
      estimatedBytes: 1536,
    }];
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
      if (channel === 'vectors:config:load') {
        return {
          apiKeys: {
            openai: { configured: true, suffix: '1234' },
            voyage: { configured: false, suffix: null },
            openrouter: { configured: true, suffix: '5678' },
          },
        };
      }
      if (channel === 'vectors:openrouter:get-models') return [openRouterModel];
      if (channel === 'vectors:openrouter:get-book-selection') {
        return { bookId: 'book-1', modelName: null };
      }
      if (channel === 'vectors:getBookIndexSizes') {
        return retainedIndexSizes;
      }
      if (channel === 'vectors:clearBookIndex') {
        retainedIndexSizes = retainedIndexSizes.filter(size => (
          size.provider !== payload?.['provider'] || size.model !== payload?.['model']
        ));
        return undefined;
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
    expect(modelOption(unavailableModel.modelName).textContent).toContain('Index ~1.5 KB');
    expect(modelOption(installedModel.modelName).textContent).toContain('Index ~0 B');
    expect(element.querySelector<HTMLButtonElement>(
      `[data-clear-index-button][aria-label="Clear index for ${installedModel.displayName}"]`,
    )?.disabled).toBe(true);
  });

  it('uses the small button and disables indexing before clearing the active model', async () => {
    await create(book());

    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      `[data-clear-index-button][aria-label="Clear index for ${unavailableModel.displayName}"]`,
    );
    expect(trigger?.disabled).toBe(false);
    trigger?.click();
    const confirmService = TestBed.inject(ConfirmModalService);
    expect(confirmService.state().message).toContain('Vector search for this book will also be disabled.');
    expect(confirmService.state().message).toContain('irreversible');

    confirmService.state().onConfirm();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('vectors:clearBookIndex', {
      bookId: 'book-1',
      provider: 'local',
      model: unavailableModel.modelName,
    }));
    fixture.detectChanges();

    expect(updateBook).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({
        settings: expect.objectContaining({ vectorSearchEnabled: false }),
      }),
    );
    expect(updateBook.mock.invocationCallOrder[0]).toBeLessThan(
      invoke.mock.invocationCallOrder.find((_, index) => (
        invoke.mock.calls[index][0] === 'vectors:clearBookIndex'
      ))!,
    );
    expect(modelOption(unavailableModel.modelName).textContent).toContain('Index ~0 B');
    expect(trigger?.disabled).toBe(true);
  });

  it('clears an inactive model without changing the indexing preference', async () => {
    retainedIndexSizes.push({
      provider: 'local',
      model: installedModel.modelName,
      paragraphCount: 2,
      estimatedBytes: 900,
    });
    await create(book());
    updateBook.mockClear();

    fixture.componentInstance.requestClearIndex(
      'local',
      installedModel.modelName,
      installedModel.displayName,
    );
    TestBed.inject(ConfirmModalService).state().onConfirm();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('vectors:clearBookIndex', {
      bookId: 'book-1',
      provider: 'local',
      model: installedModel.modelName,
    }));

    expect(updateBook).not.toHaveBeenCalled();
  });

  it('leaves the index and settings untouched when cleanup is cancelled', async () => {
    await create(book());
    invoke.mockClear();
    updateBook.mockClear();

    fixture.componentInstance.requestClearIndex(
      'local',
      unavailableModel.modelName,
      unavailableModel.displayName,
    );
    TestBed.inject(ConfirmModalService).state().onCancel();

    expect(invoke).not.toHaveBeenCalled();
    expect(updateBook).not.toHaveBeenCalled();
    expect(fixture.componentInstance.hasIndex('local', unavailableModel.modelName)).toBe(true);
  });

  it('keeps indexing disabled and reports an active-index cleanup failure', async () => {
    await create(book());
    const currentInvoke = invoke.getMockImplementation() as (
      channel: string,
      payload?: Record<string, unknown>,
    ) => Promise<unknown>;
    invoke.mockImplementation(async (channel: string, payload?: Record<string, unknown>) => {
      if (channel === 'vectors:clearBookIndex') throw new Error('cleanup failed');
      return currentInvoke(channel, payload);
    });

    fixture.componentInstance.requestClearIndex(
      'local',
      unavailableModel.modelName,
      unavailableModel.displayName,
    );
    TestBed.inject(ConfirmModalService).state().onConfirm();
    await vi.waitFor(() => expect(fixture.componentInstance.operation()).toBeNull());

    expect(updateBook).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({
        settings: expect.objectContaining({ vectorSearchEnabled: false }),
      }),
    );
    expect(fixture.componentInstance.operationError()).toBe('cleanup failed');
    expect(fixture.componentInstance.hasIndex('local', unavailableModel.modelName)).toBe(true);
  });

  it('allows an unconfigured provider tab to be viewed for retained-index cleanup', async () => {
    retainedIndexSizes.push({
      provider: 'voyage',
      model: 'voyage-3',
      paragraphCount: 3,
      estimatedBytes: 1200,
    });
    await create(book());

    providerTab('voyage').click();
    fixture.detectChanges();

    expect(providerTab('voyage').disabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Voyage 3');
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[aria-label="Clear index for Voyage 3"]',
    )?.disabled).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith(
      'vectors:cloud-provider:select-for-book',
      expect.anything(),
    );
  });

  it('renders small clear-index buttons for fixed and OpenRouter models', async () => {
    await create(book());

    await fixture.componentInstance.selectProvider('openai');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector(
      '[data-clear-index-button][aria-label="Clear index for Text Embedding 3 Large"]',
    )).not.toBeNull();

    await fixture.componentInstance.selectProvider('openrouter');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector(
      `[data-clear-index-button][aria-label="Clear index for ${openRouterModel.displayName}"]`,
    )).not.toBeNull();
  });

  it('reindexes an enabled book and keeps its old unavailable retained index manageable', async () => {
    await create(book());

    await fixture.componentInstance.selectLocalModel(installedModel);
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith('vectors:local-model:select-for-book', {
      bookId: 'book-1',
      modelName: installedModel.modelName,
      reindex: true,
    });
    expect(modelOption(unavailableModel.modelName, false)).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      `[data-clear-index-button][aria-label="Clear index for ${unavailableModel.displayName}"]`,
    )?.disabled).toBe(false);
    expect(modelOption(installedModel.modelName).getAttribute('aria-checked')).toBe('true');
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.indexing-switch')
        ?.getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('changes models without reindexing when the saved preference is disabled', async () => {
    await create(book(false));

    await fixture.componentInstance.selectLocalModel(installedModel);

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
      if (channel === 'vectors:config:load') {
        return {
          apiKeys: {
            openai: { configured: true, suffix: '1234' },
            voyage: { configured: false, suffix: null },
            openrouter: { configured: true, suffix: '5678' },
          },
        };
      }
      if (channel === 'vectors:openrouter:get-models') return [openRouterModel];
      if (channel === 'vectors:openrouter:get-book-selection') {
        return { bookId: 'book-1', modelName: null };
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

  it('defaults automatic indexing to on and disables it when indexing is unavailable', async () => {
    await create(book());

    const automaticSwitch = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.automatic-indexing-switch');
    expect(automaticSwitch?.getAttribute('aria-checked')).toBe('true');
    expect(automaticSwitch?.disabled).toBe(true);
  });

  it('persists automatic indexing without selecting or rebuilding a model', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'vectors:local-model:get-status') return [installedModel];
      if (channel === 'vectors:local-model:get-book-selection') {
        return { bookId: 'book-1', modelName: installedModel.modelName };
      }
      if (channel === 'vectors:config:load') {
        return {
          apiKeys: {
            openai: { configured: true, suffix: '1234' },
            voyage: { configured: false, suffix: null },
            openrouter: { configured: true, suffix: '5678' },
          },
        };
      }
      if (channel === 'vectors:openrouter:get-models') return [openRouterModel];
      if (channel === 'vectors:openrouter:get-book-selection') {
        return { bookId: 'book-1', modelName: null };
      }
      return undefined;
    });
    await create(book(true, installedModel.modelName, true));
    invoke.mockClear();

    await fixture.componentInstance.toggleAutomaticIndexing();

    expect(updateBook).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({
        settings: expect.objectContaining({ automaticIndexingEnabled: false }),
      }),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      'vectors:local-model:select-for-book',
      expect.anything(),
    );
  });

  it('renders all providers and marks cloud providers without an API key', async () => {
    await create(book());

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.provider-tab')).toHaveLength(4);
    expect(providerTab('local').classList.contains('is-selected')).toBe(true);
    expect(providerTab('openai').disabled).toBe(false);
    expect(providerTab('voyage').disabled).toBe(false);
    expect(providerTab('voyage').classList.contains('is-unavailable')).toBe(true);
    expect(providerTab('openrouter').disabled).toBe(false);
    expect(element.textContent).toContain('General Settings → Vector Search');
  });

  it('selects configured OpenAI immediately and reindexes an enabled book', async () => {
    await create(book());
    const emitted = vi.fn();
    fixture.componentInstance.bookChange.subscribe(emitted);

    await fixture.componentInstance.selectProvider('openai');

    expect(invoke).toHaveBeenCalledWith('vectors:cloud-provider:select-for-book', {
      bookId: 'book-1',
      providerId: 'openai',
      reindex: true,
    });
    expect(emitted).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ embeddingModel: 'openAI' }),
    }));
  });

  it('selects an OpenRouter model and preserves the indexing preference', async () => {
    await create(book(false));
    const emitted = vi.fn();
    fixture.componentInstance.bookChange.subscribe(emitted);

    await fixture.componentInstance.selectProvider('openrouter');
    await fixture.componentInstance.selectOpenRouterModel(openRouterModel);

    expect(invoke).toHaveBeenCalledWith('vectors:openrouter:select-for-book', {
      bookId: 'book-1',
      modelName: openRouterModel.modelName,
      reindex: false,
    });
    expect(emitted).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        embeddingModel: 'openRouter',
        openRouterEmbeddingModel: openRouterModel.modelName,
      }),
    }));
  });

  it('keeps the previous provider selected when a cloud switch fails', async () => {
    invoke.mockImplementation(async (channel: string, payload?: Record<string, unknown>) => {
      if (channel === 'vectors:cloud-provider:select-for-book') throw new Error('cloud failed');
      if (channel === 'vectors:local-model:get-status') return [installedModel];
      if (channel === 'vectors:local-model:get-book-selection') {
        return { bookId: 'book-1', modelName: installedModel.modelName };
      }
      if (channel === 'vectors:config:load') {
        return {
          apiKeys: {
            openai: { configured: true, suffix: '1234' },
            voyage: { configured: false, suffix: null },
            openrouter: { configured: true, suffix: '5678' },
          },
        };
      }
      if (channel === 'vectors:openrouter:get-models') return [openRouterModel];
      if (channel === 'vectors:openrouter:get-book-selection') {
        return { bookId: 'book-1', modelName: null };
      }
      return payload;
    });
    await create(book(true, installedModel.modelName));

    await fixture.componentInstance.selectProvider('openai');
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedProviderId()).toBe('local');
    expect(fixture.componentInstance.viewedProviderId()).toBe('local');
    expect(fixture.componentInstance.operationError()).toBe('cloud failed');
  });

  it('disables indexing when the saved cloud provider no longer has a key', async () => {
    const input = book();
    input.settings = { ...input.settings!, embeddingModel: 'voyage' };

    await create(input);

    const indexingSwitch = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.indexing-switch');
    expect(fixture.componentInstance.selectedProviderUnavailable()).toBe(true);
    expect(indexingSwitch?.disabled).toBe(true);
    expect(indexingSwitch?.getAttribute('aria-checked')).toBe('false');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Configure it in General Settings → Vector Search',
    );
  });

  it('shows cloud reindex progress while a provider switch is pending', async () => {
    let finishSwitch!: () => void;
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'vectors:local-model:get-status') return [installedModel];
      if (channel === 'vectors:local-model:get-book-selection') {
        return { bookId: 'book-1', modelName: installedModel.modelName };
      }
      if (channel === 'vectors:config:load') {
        return {
          apiKeys: {
            openai: { configured: true, suffix: '1234' },
            voyage: { configured: false, suffix: null },
            openrouter: { configured: true, suffix: '5678' },
          },
        };
      }
      if (channel === 'vectors:openrouter:get-models') return [openRouterModel];
      if (channel === 'vectors:openrouter:get-book-selection') {
        return { bookId: 'book-1', modelName: null };
      }
      if (channel === 'vectors:cloud-provider:select-for-book') {
        listeners.get('vectors:cloud-provider:reindex-progress')?.({
          bookId: 'book-1',
          providerId: 'openai',
          processedParagraphs: 2,
          totalParagraphs: 4,
        });
        return new Promise<void>(resolve => {
          finishSwitch = resolve;
        });
      }
      return undefined;
    });
    await create(book(true, installedModel.modelName));

    const switching = fixture.componentInstance.selectProvider('openai');
    await vi.waitFor(() => expect(fixture.componentInstance.reindexProgress()).not.toBeNull());
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2 / 4');
    finishSwitch();
    await switching;
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

  function providerTab(providerId: string): HTMLButtonElement {
    const tab = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      `[data-provider="${providerId}"]`,
    );
    if (!tab) throw new Error(`Expected provider tab: ${providerId}`);
    return tab;
  }
});

function book(
  vectorSearchEnabled = true,
  localEmbeddingModel: LocalEmbeddingModelName = 'mixedbread-ai/mxbai-embed-large-v1',
  automaticIndexingEnabled?: boolean,
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
      ...(automaticIndexingEnabled === undefined ? {} : { automaticIndexingEnabled }),
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
