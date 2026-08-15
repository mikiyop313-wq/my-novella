import { TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { vi } from 'vitest';

import { AiStreamService } from '../../../../core/services/ai-stream.service';
import { AiStreamEditorService } from './ai-stream-editor.service';

describe('AiStreamEditorService', () => {
  it('streams manuscript work with the scene-beat preset category', async () => {
    const streamText = vi.fn().mockResolvedValue('');
    TestBed.configureTestingModule({
      providers: [
        AiStreamEditorService,
        { provide: AiStreamService, useValue: { loadingState: new Map(), streamText } },
      ],
    });
    const service = TestBed.inject(AiStreamEditorService);
    vi.spyOn(service as any, 'finalizeGeneratingBlock').mockImplementation(() => undefined);

    await (service as any).streamToBlock(
      {} as Editor,
      10,
      { id: 'block-1' },
      'Continue.',
      'openrouter',
      'model-1',
      false,
      'book-1',
    );

    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      streamId: 'block-1',
      bookId: 'book-1',
      systemPromptCategory: 'sceneBeat',
      prompt: 'Continue.',
    }));

    TestBed.resetTestingModule();
  });

  it('forwards structured messages through new-block streaming', async () => {
    TestBed.configureTestingModule({
      providers: [
        AiStreamEditorService,
        { provide: AiStreamService, useValue: { loadingState: new Map() } },
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
      'book-1',
      'block-1',
      messages,
    );

    expect(insertInitialBlock).toHaveBeenCalled();
    expect(streamToBlock).toHaveBeenCalledWith(
      editor,
      12,
      expect.objectContaining({ id: 'block-1' }),
      'Continue.',
      'openrouter',
      'model-1',
      false,
      'book-1',
      messages,
    );

    TestBed.resetTestingModule();
  });

  it('forwards the book through existing-block regeneration', async () => {
    TestBed.configureTestingModule({
      providers: [
        AiStreamEditorService,
        { provide: AiStreamService, useValue: { loadingState: new Map() } },
      ],
    });
    const service = TestBed.inject(AiStreamEditorService);
    vi.spyOn(service as any, 'markBlockAsGenerating').mockImplementation(() => undefined);
    vi.spyOn(service as any, 'resetBlockContent').mockReturnValue(21);
    const streamToBlock = vi.spyOn(service as any, 'streamToBlock').mockResolvedValue(undefined);
    const editor = {} as Editor;

    await service.regenerateExistingBlock(
      editor,
      20,
      { id: 'block-1', promptText: 'Original prompt' },
      'Try again',
      'openrouter',
      'model-1',
      false,
      'book-1',
    );

    expect(streamToBlock).toHaveBeenCalledWith(
      editor,
      21,
      expect.objectContaining({ id: 'block-1' }),
      'Try again',
      'openrouter',
      'model-1',
      false,
      'book-1',
    );

    TestBed.resetTestingModule();
  });
});
