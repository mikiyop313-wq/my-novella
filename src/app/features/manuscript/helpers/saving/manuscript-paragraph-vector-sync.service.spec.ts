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

  beforeEach(() => {
    upsertParagraphs = vi.fn().mockResolvedValue(undefined);
    deleteParagraphs = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        ManuscriptParagraphVectorSyncService,
        { provide: ManuscriptStore, useValue: { bookId: signal('book-1') } },
        {
          provide: ParagraphVectorService,
          useValue: { upsertParagraphs, deleteParagraphs },
        },
      ],
    });
    service = TestBed.inject(ManuscriptParagraphVectorSyncService);
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('flushes queued upserts and deletes through the shared vector service', async () => {
    service.seedKnownParagraphs('scene-1', [paragraph('removed', 'Old paragraph')]);
    service.snapshotDirtyParagraphs('scene-1', [paragraph('added', 'New paragraph')]);

    await service.flushParagraphVectorChanges();

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
    await service.flushParagraphVectorChanges();

    expect(upsertParagraphs).toHaveBeenCalledTimes(2);
    expect(upsertParagraphs.mock.calls[1][0]).toEqual(upsertParagraphs.mock.calls[0][0]);
  });
});

function paragraph(id: string, text: string): Record<string, unknown> {
  return {
    type: 'paragraph',
    attrs: { id },
    content: [{ type: 'text', text }],
  };
}
