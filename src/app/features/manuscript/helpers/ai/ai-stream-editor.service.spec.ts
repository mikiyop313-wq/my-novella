import { TestBed } from '@angular/core/testing';
import { Editor, Node } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { vi } from 'vitest';

import { AiStreamService } from '../../../../core/services/ai-stream.service';
import { AiGenerationSessionService } from '../../../../core/services/ai-generation-session.service';
import { ElectronService } from '../../../../core/services/electron.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { buildAiPrompt } from '../../../../shared/utils/ai-prompt-builder';
import { ManuscriptStore } from '../../store/manuscript.store';
import { ManuscriptProseSaverService } from '../saving/manuscript-prose-saver.service';
import { AiStreamEditorService } from './ai-stream-editor.service';

const AiGeneratedBlock = Node.create({
  name: 'aiGeneratedBlock',
  group: 'block',
  content: 'block+',
  addAttributes() {
    return {
      id: { default: '' },
      sourcePromptId: { default: '' },
      isGenerating: { default: false },
    };
  },
  renderHTML() {
    return ['div', 0];
  },
});

describe('AiStreamEditorService', () => {
  it('locks each scene to one generation owner while allowing other scenes', () => {
    TestBed.configureTestingModule({
      providers: [AiStreamEditorService],
    });

    const service = TestBed.inject(AiStreamEditorService);

    expect(service.acquireSceneGeneration({ sceneId: 'scene-1', ownerId: 'prompt-1' })).toBe(true);
    expect(service.acquireSceneGeneration({ sceneId: 'scene-1', ownerId: 'prompt-2' })).toBe(false);
    expect(service.acquireSceneGeneration({ sceneId: 'scene-2', ownerId: 'prompt-2' })).toBe(true);
    expect(service.hasActiveSceneGeneration('scene-1')).toBe(true);
    expect(service.isSceneGenerationOwner({ sceneId: 'scene-1', ownerId: 'prompt-1' })).toBe(true);

    service.releaseSceneGeneration({ sceneId: 'scene-1', ownerId: 'prompt-2' });
    expect(service.hasActiveSceneGeneration('scene-1')).toBe(true);

    service.releaseSceneGeneration({ sceneId: 'scene-1', ownerId: 'prompt-1' });
    expect(service.hasActiveSceneGeneration('scene-1')).toBe(false);
    TestBed.resetTestingModule();
  });

  it('releases a pending prompt scene lock when stopped before streaming', async () => {
    TestBed.configureTestingModule({ providers: [AiStreamEditorService] });
    const service = TestBed.inject(AiStreamEditorService);
    service.acquireSceneGeneration({ sceneId: 'scene-1', ownerId: 'prompt-1' });

    expect(service.hasActivePromptGeneration('prompt-1')).toBe(true);
    expect(service.ensurePromptLoadingState('prompt-1')()).toBe('loading');

    await service.stopPromptGeneration('prompt-1');

    expect(service.hasActiveSceneGeneration('scene-1')).toBe(false);
    TestBed.resetTestingModule();
  });

  it('keeps an active prompt stoppable after its view is recreated', async () => {
    let rejectStream!: (error: Error) => void;
    const streamText = vi.fn(() => new Promise<string>((_, reject) => {
      rejectStream = reject;
    }));
    const stopStream = vi.fn(async () => rejectStream(new Error('aborted')));
    TestBed.configureTestingModule({
      providers: [
        AiStreamEditorService,
        { provide: AiStreamService, useValue: { streamText, stopStream } },
        { provide: ToastService, useValue: { error: vi.fn(), warning: vi.fn() } },
      ],
    });
    const service = TestBed.inject(AiStreamEditorService);
    vi.spyOn(service as any, 'persistCompletedGeneration').mockResolvedValue(undefined);

    const generation = (service as any).streamToBlock(
      { id: 'response-1', sourcePromptId: 'prompt-1' },
      textPrompt('Continue.'),
      'openrouter',
      'model-1',
      false,
      'book-1',
      'scene-1',
    );

    expect(service.ensurePromptLoadingState('prompt-1')()).toBe('loading');
    expect(service.hasActivePromptGeneration('prompt-1')).toBe(true);

    await service.stopPromptGeneration('prompt-1');
    await generation;

    expect(stopStream).toHaveBeenCalledWith('response-1');
    expect(service.ensurePromptLoadingState('prompt-1')()).toBe('idle');
    TestBed.resetTestingModule();
  });

  it('streams manuscript work with the scene-beat preset category', async () => {
    const streamText = vi.fn().mockResolvedValue('');
    TestBed.configureTestingModule({
      providers: [
        AiStreamEditorService,
        { provide: AiStreamService, useValue: { loadingState: new Map(), streamText } },
      ],
    });
    const service = TestBed.inject(AiStreamEditorService);
    const generationSessions = TestBed.inject(AiGenerationSessionService);
    const startSession = vi.spyOn(generationSessions, 'start');
    vi.spyOn(service as any, 'persistCompletedGeneration').mockResolvedValue(undefined);
    const aiPrompt = textPrompt('Continue.');

    await (service as any).streamToBlock(
      { id: 'block-1' },
      aiPrompt,
      'openrouter',
      'model-1',
      false,
      'book-1',
      'scene-1',
    );

    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      streamId: 'block-1',
      bookId: 'book-1',
      aiPrompt,
    }));
    expect(startSession).toHaveBeenCalledWith(expect.objectContaining({
      source: 'manuscript-prose',
      scopeId: 'scene-1',
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
    const aiPrompt = buildAiPrompt({
      requestType: 'sceneBeat',
      messages: messages.map(message => ({
        role: message.role,
        parts: [{ type: 'text' as const, content: message.content }],
      })),
    });
    const editor = {} as Editor;

    await service.generateNewBlock({
      editor,
      insertPos: 10,
      aiPrompt,
      provider: 'openrouter',
      modelId: 'model-1',
      reasoningMode: false,
      bookId: 'book-1',
      responseId: 'response-1',
      sourcePromptId: 'prompt-1',
      sceneId: 'scene-1',
    });

    expect(insertInitialBlock).toHaveBeenCalled();
    expect(streamToBlock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'response-1', sourcePromptId: 'prompt-1' }),
      aiPrompt,
      'openrouter',
      'model-1',
      false,
      'book-1',
      'scene-1',
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
    const aiPrompt = textPrompt('Try again');

    await service.regenerateExistingBlock({
      editor,
      blockPos: 20,
      currentAttrs: {
        id: 'response-1',
        sourcePromptId: 'prompt-1',
        promptText: 'Original prompt',
      },
      aiPrompt,
      provider: 'openrouter',
      modelId: 'model-1',
      reasoningMode: false,
      bookId: 'book-1',
      promptText: 'Updated prompt',
      sceneId: 'scene-1',
    });

    expect(streamToBlock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'response-1', sourcePromptId: 'prompt-1' }),
      aiPrompt,
      'openrouter',
      'model-1',
      false,
      'book-1',
      'scene-1',
    );
    expect((service as any).markBlockAsGenerating).toHaveBeenCalledWith(
      editor,
      20,
      expect.objectContaining({
        promptText: 'Updated prompt',
        provider: 'openrouter',
        modelId: 'model-1',
        reasoningMode: false,
      }),
    );

    TestBed.resetTestingModule();
  });

  it('keeps responses for the same prompt independently addressable', () => {
    TestBed.configureTestingModule({
      providers: [
        AiStreamEditorService,
        { provide: AiStreamService, useValue: { loadingState: new Map() } },
      ],
    });
    const service = TestBed.inject(AiStreamEditorService);
    const editor = {
      state: {
        doc: {
          descendants: (callback: (node: any, pos: number) => boolean) => {
            callback({
              type: { name: 'aiGeneratedBlock' },
              attrs: { id: 'response-1', sourcePromptId: 'prompt-1', isGenerating: true },
            }, 5);
            callback({
              type: { name: 'aiGeneratedBlock' },
              attrs: { id: 'response-2', sourcePromptId: 'prompt-1', isGenerating: true },
            }, 20);
          },
        },
      },
    } as unknown as Editor;

    expect((service as any).findGeneratingBlockPos(editor, 'response-1')).toBe(5);
    expect((service as any).findGeneratingBlockPos(editor, 'response-2')).toBe(20);

    TestBed.resetTestingModule();
  });

  it('renders completed Markdown as formatted Tiptap content', () => {
    TestBed.configureTestingModule({
      providers: [
        AiStreamEditorService,
        { provide: AiStreamService, useValue: { loadingState: new Map() } },
      ],
    });
    const service = TestBed.inject(AiStreamEditorService);
    const editor = createGeneratingEditor();

    (service as any).renderGeneratedMarkdown(editor, [
      '# Heading',
      '',
      '**bold** *italic* ~~strike~~ [link](https://example.com)',
      '',
      '- bullet',
      '1. ordered',
      '',
      '> quote',
      '',
      '`inline`',
      '',
      '```ts',
      'const value = true;',
      '```',
      '',
      'first line  ',
      'second line',
      '',
      '---',
    ].join('\n'), 'response-1');

    const content = (editor.getJSON().content?.[0].content ?? []) as any[];

    expect(content.map(node => node.type)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
      'orderedList',
      'blockquote',
      'paragraph',
      'codeBlock',
      'paragraph',
      'horizontalRule',
    ]);
    const inlineContent = content[1].content as any[];

    expect(inlineContent.find(node => node.text === 'bold')?.marks).toContainEqual({ type: 'bold' });
    expect(inlineContent.find(node => node.text === 'italic')?.marks).toContainEqual({ type: 'italic' });
    expect(inlineContent.find(node => node.text === 'strike')?.marks).toContainEqual({ type: 'strike' });
    expect(inlineContent.find(node => node.text === 'link')?.marks).toContainEqual({
      type: 'link',
      attrs: expect.objectContaining({ href: 'https://example.com' }),
    });
    expect(content[5].content?.[0].marks).toContainEqual({ type: 'code' });
    expect(content[7].content?.map((node: any) => node.type)).toContain('hardBreak');

    editor.destroy();
    TestBed.resetTestingModule();
  });

  it('keeps formatted content when the generated block is applied', () => {
    TestBed.configureTestingModule({
      providers: [
        AiStreamEditorService,
        { provide: AiStreamService, useValue: { loadingState: new Map() } },
      ],
    });
    const service = TestBed.inject(AiStreamEditorService);
    const editor = createGeneratingEditor();

    (service as any).renderGeneratedMarkdown(editor, '**formatted**', 'response-1');

    const block = editor.state.doc.nodeAt(0)!;
    service.applyBlock(editor, 0, block.nodeSize, block.content);

    expect(editor.getJSON().content?.[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'formatted', marks: [{ type: 'bold' }] }],
    });

    editor.destroy();
    TestBed.resetTestingModule();
  });

  it('keeps plain and incomplete Markdown readable after a partial response', () => {
    TestBed.configureTestingModule({
      providers: [
        AiStreamEditorService,
        { provide: AiStreamService, useValue: { loadingState: new Map() } },
      ],
    });
    const service = TestBed.inject(AiStreamEditorService);
    const editor = createGeneratingEditor();

    expect(() => (service as any).renderGeneratedMarkdown(
      editor,
      'Plain text with **unfinished',
      'response-1',
    )).not.toThrow();
    expect(editor.state.doc.textContent).toBe('Plain text with **unfinished');

    editor.destroy();
    TestBed.resetTestingModule();
  });

  it('merges a completed response into the latest source-scene prose by block ID', async () => {
    const updateScene = vi.fn().mockResolvedValue(undefined);
    const flushDirtySections = vi.fn().mockResolvedValue(undefined);
    const invoke = vi.fn().mockResolvedValue({
      'scene-1': {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'User edit' }] },
          {
            type: 'aiGeneratedBlock',
            attrs: { id: 'response-1', isGenerating: true },
            content: [{ type: 'paragraph' }],
          },
        ],
      },
    });

    TestBed.configureTestingModule({
      providers: [
        AiStreamEditorService,
        { provide: AiStreamService, useValue: { loadingState: new Map() } },
        { provide: ElectronService, useValue: { invoke } },
        { provide: ManuscriptStore, useValue: { updateScene } },
        { provide: ManuscriptProseSaverService, useValue: { flushDirtySections } },
        { provide: ToastService, useValue: { error: vi.fn(), warning: vi.fn() } },
      ],
    });
    const service = TestBed.inject(AiStreamEditorService);

    await (service as any).persistCompletedGeneration({
      sceneId: 'scene-1',
      blockId: 'response-1',
      blockAttrs: { id: 'response-1', sourcePromptId: 'prompt-1' },
      content: '**Generated** prose',
      reasoning: 'Reasoning',
      removeBlock: false,
    });

    expect(updateScene).toHaveBeenCalledWith(expect.objectContaining({
      id: 'scene-1',
      prose: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'User edit' }] },
          expect.objectContaining({
            type: 'aiGeneratedBlock',
            attrs: expect.objectContaining({
              id: 'response-1',
              isGenerating: false,
              reasoningText: 'Reasoning',
            }),
          }),
        ],
      },
    }));
    TestBed.resetTestingModule();
  });
});

function textPrompt(content: string) {
  return buildAiPrompt({
    requestType: 'sceneBeat',
    messages: [{
      role: 'user',
      parts: [{ type: 'text', content }],
    }],
  });
}

function createGeneratingEditor(): Editor {
  return new Editor({
    extensions: [StarterKit, Markdown, AiGeneratedBlock],
    content: {
      type: 'doc',
      content: [{
        type: 'aiGeneratedBlock',
        attrs: {
          id: 'response-1',
          sourcePromptId: 'prompt-1',
          isGenerating: true,
        },
        content: [{ type: 'paragraph' }],
      }],
    },
  });
}
