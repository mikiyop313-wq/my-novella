import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ElectronService } from '../../core/services/electron.service';
import { ParagraphVectorService } from './paragraph-vector.service';

describe('ParagraphVectorService', () => {
  let service: ParagraphVectorService;
  let invoke: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invoke = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        ParagraphVectorService,
        { provide: ElectronService, useValue: { invoke } },
      ],
    });
    service = TestBed.inject(ParagraphVectorService);
  });

  it('searches for similar paragraphs through the vector IPC channel', async () => {
    const payload = { bookId: 'book-1', query: 'silver key', limit: 3 };
    const results = [{
      paragraphId: 'paragraph-1',
      actId: 'act-1',
      chapterId: 'chapter-1',
      sceneId: 'scene-1',
      text: 'Mara found the silver key.',
      distance: 0.12,
    }];
    invoke.mockResolvedValue(results);

    await expect(service.searchSimilarParagraphs(payload)).resolves.toBe(results);
    expect(invoke).toHaveBeenCalledWith('vectors:searchSimilar', payload);
  });

  it('upserts paragraphs through the vector IPC channel', async () => {
    const payload = {
      bookId: 'book-1',
      upserts: [{
        paragraphId: 'paragraph-1',
        sceneId: 'scene-1',
        text: 'Mara found the silver key.',
        hash: 'hash-1',
        position: 0,
      }],
    };
    invoke.mockResolvedValue(undefined);

    await expect(service.upsertParagraphs(payload)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('vectors:upsertParagraphs', payload);
  });

  it('deletes paragraphs through the vector IPC channel', async () => {
    const payload = {
      bookId: 'book-1',
      deletes: [{ paragraphId: 'paragraph-1', sceneId: 'scene-1' }],
    };
    invoke.mockResolvedValue(undefined);

    await expect(service.deleteParagraphs(payload)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('vectors:deleteParagraphs', payload);
  });

  it('propagates IPC failures', async () => {
    const error = new Error('Vector IPC unavailable');
    invoke.mockRejectedValue(error);

    await expect(service.searchSimilarParagraphs({
      bookId: 'book-1',
      query: 'silver key',
    })).rejects.toBe(error);
  });
});
