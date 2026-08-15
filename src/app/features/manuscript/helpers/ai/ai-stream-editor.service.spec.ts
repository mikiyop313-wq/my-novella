import { TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { vi } from 'vitest';

import { AiStreamService } from '../../../../core/services/ai-stream.service';
import { ManuscriptProseSaverService } from '../saving/manuscript-prose-saver.service';
import { AiStreamEditorService } from './ai-stream-editor.service';

describe('AiStreamEditorService', () => {
  it('forwards structured messages through new-block streaming', async () => {
    const flushParagraphVectorChanges = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        AiStreamEditorService,
        { provide: AiStreamService, useValue: { loadingState: new Map() } },
        { provide: ManuscriptProseSaverService, useValue: { flushParagraphVectorChanges } },
      ],
    });
    const service = TestBed.inject(AiStreamEditorService);
    const insertInitialBlock = vi.spyOn(service as any, 'insertInitialBlock').mockReturnValue(12);
    const streamToBlock = vi.spyOn(service as any, 'streamToBlock').mockResolvedValue(undefined);
    const messages = [
      { role: 'system' as const, content: 'Reference data.' },
      { role: 'user' as const, content: 'Continue.' },
    ];
    const editor = {} as Editor;

    await service.generateNewBlock(
      editor,
      10,
      'Continue.',
      'openrouter',
      'model-1',
      false,
      'block-1',
      messages,
    );

    expect(flushParagraphVectorChanges).toHaveBeenCalledOnce();
    expect(insertInitialBlock).toHaveBeenCalled();
    expect(streamToBlock).toHaveBeenCalledWith(
      editor,
      12,
      expect.objectContaining({ id: 'block-1' }),
      'Continue.',
      'openrouter',
      'model-1',
      false,
      messages,
    );

    TestBed.resetTestingModule();
  });
});
