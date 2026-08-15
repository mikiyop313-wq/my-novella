import { TestBed } from '@angular/core/testing';
import { Editor, Node } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { vi } from 'vitest';

import { AiStreamService } from '../../../../core/services/ai-stream.service';
import { buildAiPrompt } from '../../../../shared/utils/ai-prompt-builder';
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
    const aiPrompt = textPrompt('Continue.');

    await (service as any).streamToBlock(
      {} as Editor,
      10,
      { id: 'block-1' },
      aiPrompt,
      'openrouter',
      'model-1',
      false,
      'book-1',
    );

    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      streamId: 'block-1',
      bookId: 'book-1',
      aiPrompt,
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
    });

    expect(insertInitialBlock).toHaveBeenCalled();
    expect(streamToBlock).toHaveBeenCalledWith(
      editor,
      12,
      expect.objectContaining({ id: 'response-1', sourcePromptId: 'prompt-1' }),
      aiPrompt,
      'openrouter',
      'model-1',
      false,
      'book-1',
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
    });

    expect(streamToBlock).toHaveBeenCalledWith(
      editor,
      21,
      expect.objectContaining({ id: 'response-1', sourcePromptId: 'prompt-1' }),
      aiPrompt,
      'openrouter',
      'model-1',
      false,
      'book-1',
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
