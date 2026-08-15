import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ParagraphVectorService } from '../../../../shared/services/paragraph-vector.service';
import { ManuscriptStore } from '../../store/manuscript.store';
import { ManuscriptParagraphVectorSyncService } from './manuscript-paragraph-vector-sync.service';

describe('ManuscriptParagraphVectorSyncService', () => {
  let service: ManuscriptParagraphVectorSyncService;
  let upsertParagraphs: ReturnType<typeof vi.fn>;
  let deleteParagraphs: ReturnType<typeof vi.fn>;
  let getBookIndexingConfiguration: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    upsertParagraphs = vi.fn().mockResolvedValue(undefined);
    deleteParagraphs = vi.fn().mockResolvedValue(undefined);
    getBookIndexingConfiguration = vi.fn().mockResolvedValue({
      available: true,
      automaticIndexingEnabled: true,
    });

    TestBed.configureTestingModule({
      providers: [
        ManuscriptParagraphVectorSyncService,
        { provide: ManuscriptStore, useValue: { bookId: signal('book-1') } },
        {
          provide: ParagraphVectorService,
          useValue: { upsertParagraphs, deleteParagraphs, getBookIndexingConfiguration },
        },
      ],
    });
    service = TestBed.inject(ManuscriptParagraphVectorSyncService);
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('flushes queued upserts and deletes through the shared vector service', async () => {
    service.seedKnownParagraphs('scene-1', [paragraph('removed', 'Old paragraph')]);
    service.snapshotDirtyParagraphs('scene-1', [paragraph('added', 'New paragraph')]);

    expect(service.indexingState()).toBe('pending');

    const flush = service.flushParagraphVectorChanges();
    expect(service.indexingState()).toBe('indexing');
    await flush;

    expect(service.indexingState()).toBe('updated');

    expect(upsertParagraphs).toHaveBeenCalledWith({
      bookId: 'book-1',
      upserts: [expect.objectContaining({
        paragraphId: 'added',
        sceneId: 'scene-1',
        text: 'New paragraph',
        position: 0,
      })],
    });
    expect(deleteParagraphs).toHaveBeenCalledWith({
      bookId: 'book-1',
      deletes: [{ paragraphId: 'removed', sceneId: 'scene-1' }],
    });
  });

  it('requeues vector changes when a shared-service write fails', async () => {
    upsertParagraphs
      .mockRejectedValueOnce(new Error('Embedding provider unavailable'))
      .mockResolvedValueOnce(undefined);
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'New paragraph')]);

    await service.flushParagraphVectorChanges();
    expect(service.indexingState()).toBe('error');

    await service.retryParagraphVectorChanges();

    expect(upsertParagraphs).toHaveBeenCalledTimes(2);
    expect(upsertParagraphs.mock.calls[1][0]).toEqual(upsertParagraphs.mock.calls[0][0]);
    expect(service.indexingState()).toBe('updated');
  });

  it('returns to updated when edits are undone before indexing', () => {
    const original = paragraph('paragraph-1', 'Original paragraph');
    service.seedKnownParagraphs('scene-1', [original]);

    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'Changed paragraph')]);
    expect(service.indexingState()).toBe('pending');

    service.snapshotDirtyParagraphs('scene-1', [original]);
    expect(service.indexingState()).toBe('updated');
  });

  it('does not index paragraphs inside generating or finalized AI blocks', async () => {
    const generatedParagraph = paragraph('generated-1', 'Generated paragraph');

    service.snapshotDirtyParagraphs('scene-1', [
      aiGeneratedBlock(true, [generatedParagraph]),
    ]);
    service.snapshotDirtyParagraphs('scene-1', [
      aiGeneratedBlock(false, [generatedParagraph]),
    ]);

    expect(service.indexingState()).toBe('updated');
    await service.flushParagraphVectorChanges();
    expect(upsertParagraphs).not.toHaveBeenCalled();
    expect(deleteParagraphs).not.toHaveBeenCalled();
  });

  it('continues indexing normal paragraphs adjacent to an AI block', async () => {
    service.snapshotDirtyParagraphs('scene-1', [
      paragraph('before', 'Before generated text'),
      aiGeneratedBlock(false, [paragraph('generated-1', 'Generated paragraph')]),
      paragraph('after', 'After generated text'),
    ]);

    await service.flushParagraphVectorChanges();

    expect(upsertParagraphs).toHaveBeenCalledWith({
      bookId: 'book-1',
      upserts: [
        expect.objectContaining({ paragraphId: 'before', position: 0 }),
        expect.objectContaining({ paragraphId: 'after', position: 1 }),
      ],
    });
  });

  it('indexes generated paragraphs after the AI block is applied', async () => {
    const generatedParagraph = paragraph('generated-1', 'Generated paragraph');
    service.snapshotDirtyParagraphs('scene-1', [
      aiGeneratedBlock(false, [generatedParagraph]),
    ]);

    expect(service.indexingState()).toBe('updated');

    service.snapshotDirtyParagraphs('scene-1', [generatedParagraph]);
    expect(service.indexingState()).toBe('pending');
    await service.flushParagraphVectorChanges();

    expect(upsertParagraphs).toHaveBeenCalledWith({
      bookId: 'book-1',
      upserts: [expect.objectContaining({
        paragraphId: 'generated-1',
        sceneId: 'scene-1',
        text: 'Generated paragraph',
        position: 0,
      })],
    });
  });

  it('stays pending when a newer edit is queued during indexing', async () => {
    let completeUpsert!: () => void;
    upsertParagraphs.mockImplementationOnce(() => new Promise<void>(resolve => {
      completeUpsert = resolve;
    }));
    service.seedKnownParagraphs('scene-1', [paragraph('paragraph-1', 'Original paragraph')]);
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'First edit')]);

    const flush = service.flushParagraphVectorChanges();
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'Newer edit')]);
    completeUpsert();
    await flush;

    expect(service.indexingState()).toBe('pending');
    await service.flushParagraphVectorChanges();
    expect(upsertParagraphs.mock.calls[1][0].upserts[0].text).toBe('Newer edit');
    expect(service.indexingState()).toBe('updated');
  });

  it('keeps an undo queued when it returns to the old baseline during indexing', async () => {
    let completeUpsert!: () => void;
    upsertParagraphs.mockImplementationOnce(() => new Promise<void>(resolve => {
      completeUpsert = resolve;
    }));
    const original = paragraph('paragraph-1', 'Original paragraph');
    service.seedKnownParagraphs('scene-1', [original]);
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'Changed paragraph')]);

    const flush = service.flushParagraphVectorChanges();
    service.snapshotDirtyParagraphs('scene-1', [original]);
    completeUpsert();
    await flush;

    expect(service.indexingState()).toBe('pending');
    await service.flushParagraphVectorChanges();
    expect(upsertParagraphs.mock.calls[1][0].upserts[0].text).toBe('Original paragraph');
    expect(service.indexingState()).toBe('updated');
  });

  it('loads indexing configuration for the active book', async () => {
    getBookIndexingConfiguration.mockResolvedValueOnce({
      available: true,
      automaticIndexingEnabled: false,
    });
    await service.refreshIndexingConfiguration('book-2');

    expect(getBookIndexingConfiguration).toHaveBeenCalledWith('book-2');
    expect(service.indexingAvailable()).toBe(true);
    expect(service.automaticIndexingEnabled()).toBe(false);
  });

  it('flushes the latest pending content after ten idle seconds', async () => {
    vi.useFakeTimers();
    await service.refreshIndexingConfiguration('book-1');
    service.seedKnownParagraphs('scene-1', [paragraph('paragraph-1', 'Original')]);

    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'First edit')]);
    await vi.advanceTimersByTimeAsync(9_000);
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'Latest edit')]);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(upsertParagraphs).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(upsertParagraphs).toHaveBeenCalledOnce();
    expect(upsertParagraphs.mock.calls[0][0].upserts[0].text).toBe('Latest edit');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(upsertParagraphs).toHaveBeenCalledOnce();
    expect(service.indexingState()).toBe('updated');
  });

  it('does not overlap indexing batches or restore an older synced baseline', async () => {
    let completeUpsert!: () => void;
    upsertParagraphs.mockImplementationOnce(() => new Promise<void>(resolve => {
      completeUpsert = resolve;
    }));
    service.seedKnownParagraphs('scene-1', [paragraph('paragraph-1', 'Original')]);
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'First edit')]);

    const firstFlush = service.flushParagraphVectorChanges();
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'Newer edit')]);
    const concurrentFlush = service.flushParagraphVectorChanges();

    expect(upsertParagraphs).toHaveBeenCalledOnce();
    completeUpsert();
    await Promise.all([firstFlush, concurrentFlush]);
    expect(service.indexingState()).toBe('pending');

    await service.flushParagraphVectorChanges();
    expect(upsertParagraphs).toHaveBeenCalledTimes(2);
    expect(upsertParagraphs.mock.calls[1][0].upserts[0].text).toBe('Newer edit');
    expect(service.indexingState()).toBe('updated');
  });

  it('cancels automatic flushing when pending work is undone', async () => {
    vi.useFakeTimers();
    await service.refreshIndexingConfiguration('book-1');
    const original = paragraph('paragraph-1', 'Original');
    service.seedKnownParagraphs('scene-1', [original]);
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'Changed')]);
    service.snapshotDirtyParagraphs('scene-1', [original]);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(upsertParagraphs).not.toHaveBeenCalled();
  });

  it('does not schedule background flushing in manual mode', async () => {
    vi.useFakeTimers();
    getBookIndexingConfiguration.mockResolvedValueOnce({
      available: true,
      automaticIndexingEnabled: false,
    });
    await service.refreshIndexingConfiguration('book-1');
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'Changed')]);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(upsertParagraphs).not.toHaveBeenCalled();
    expect(service.indexingState()).toBe('pending');
  });

  it('schedules pending work when automatic configuration finishes loading', async () => {
    vi.useFakeTimers();
    let resolveConfiguration!: (value: { available: boolean; automaticIndexingEnabled: boolean }) => void;
    getBookIndexingConfiguration.mockReturnValueOnce(new Promise(resolve => {
      resolveConfiguration = resolve;
    }));

    const refresh = service.refreshIndexingConfiguration('book-1');
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'Changed')]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(upsertParagraphs).not.toHaveBeenCalled();

    resolveConfiguration({ available: true, automaticIndexingEnabled: true });
    await refresh;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(upsertParagraphs).toHaveBeenCalledOnce();
  });

  it('cancels an automatic timer when an immediate flush starts', async () => {
    vi.useFakeTimers();
    await service.refreshIndexingConfiguration('book-1');
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'Changed')]);

    await service.flushParagraphVectorChanges();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(upsertParagraphs).toHaveBeenCalledOnce();
  });

  it('cancels an outstanding timer when destroyed', async () => {
    vi.useFakeTimers();
    await service.refreshIndexingConfiguration('book-1');
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'Changed')]);
    service.ngOnDestroy();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(upsertParagraphs).not.toHaveBeenCalled();
  });

  it('ignores configuration that resolves after the active book changes', async () => {
    let resolveOldConfiguration!: (
      value: { available: boolean; automaticIndexingEnabled: boolean },
    ) => void;
    getBookIndexingConfiguration
      .mockReturnValueOnce(new Promise(resolve => {
        resolveOldConfiguration = resolve;
      }))
      .mockResolvedValueOnce({ available: true, automaticIndexingEnabled: false });

    const oldRefresh = service.refreshIndexingConfiguration('book-1');
    await service.refreshIndexingConfiguration('book-2');
    resolveOldConfiguration({ available: true, automaticIndexingEnabled: true });
    await oldRefresh;

    expect(service.automaticIndexingEnabled()).toBe(false);
  });

  it('debounces edits queued while an automatic flush is in flight', async () => {
    vi.useFakeTimers();
    let completeUpsert!: () => void;
    upsertParagraphs.mockImplementationOnce(() => new Promise<void>(resolve => {
      completeUpsert = resolve;
    }));
    await service.refreshIndexingConfiguration('book-1');
    service.seedKnownParagraphs('scene-1', [paragraph('paragraph-1', 'Original')]);
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'First edit')]);

    await vi.advanceTimersByTimeAsync(10_000);
    service.snapshotDirtyParagraphs('scene-1', [paragraph('paragraph-1', 'Newer edit')]);
    completeUpsert();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(upsertParagraphs).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    expect(upsertParagraphs).toHaveBeenCalledTimes(2);
    expect(upsertParagraphs.mock.calls[1][0].upserts[0].text).toBe('Newer edit');
  });
});

function paragraph(id: string, text: string): Record<string, unknown> {
  return {
    type: 'paragraph',
    attrs: { id },
    content: [{ type: 'text', text }],
  };
}

function aiGeneratedBlock(
  isGenerating: boolean,
  content: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    type: 'aiGeneratedBlock',
    attrs: { isGenerating },
    content,
  };
}
