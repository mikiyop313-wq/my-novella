import { TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { vi } from 'vitest';

import { ElectronService } from '../../../../core/services/electron.service';
import { CodexService } from '../../../codex/services/codex.service';
import { LibraryStore } from '../../../library/store/book.store';
import { ManuscriptProseSaverService } from '../saving/manuscript-prose-saver.service';
import type { ActDto, ChapterDto, SceneDto } from '../../../../../../shared/models/manuscript.model';
import { ManuscriptAiContextService } from './manuscript-ai-context.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { ParagraphVectorService } from '../../../../shared/services/paragraph-vector.service';

const AFTER_PROSE_NOTE = '[THE FOLLOWING PROSE AND ANY SUBSEQUENT SCENES, CHAPTERS, OR ACTS OCCUR AFTER THE INSERTION POINT. USE THEM ONLY AS FUTURE CONTEXT.]';

describe('ManuscriptAiContextService', () => {
  let service: ManuscriptAiContextService;
  let invoke: ReturnType<typeof vi.fn>;
  let getEntry: ReturnType<typeof vi.fn>;
  let flushDirtySections: ReturnType<typeof vi.fn>;
  let flushParagraphVectorChanges: ReturnType<typeof vi.fn>;
  let warning: ReturnType<typeof vi.fn>;
  let books: ReturnType<typeof vi.fn>;
  let searchSimilarParagraphs: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invoke = vi.fn();
    getEntry = vi.fn().mockResolvedValue(undefined);
    flushDirtySections = vi.fn().mockResolvedValue(undefined);
    flushParagraphVectorChanges = vi.fn().mockResolvedValue(undefined);
    warning = vi.fn();
    searchSimilarParagraphs = vi.fn().mockResolvedValue([]);
    books = vi.fn(() => [{
      id: 'book-1',
      settings: { pointOfView: 'third_omni' },
    }]);

    TestBed.configureTestingModule({
      providers: [
        ManuscriptAiContextService,
        { provide: ElectronService, useValue: { invoke } },
        { provide: CodexService, useValue: { getEntry } },
        { provide: LibraryStore, useValue: { books } },
        {
          provide: ManuscriptProseSaverService,
          useValue: { flushDirtySections, flushParagraphVectorChanges },
        },
        { provide: ToastService, useValue: { warning } },
        { provide: ParagraphVectorService, useValue: { searchSimilarParagraphs } },
      ],
    });
    service = TestBed.inject(ManuscriptAiContextService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('loads the previous skeletonized scene and places the author prompt last', async () => {
    const doc = schema.node('doc', null, [
      sceneSummary('scene-1'),
      schema.node('sceneSkeleton'),
      sceneSummary('scene-2'),
      paragraph('Current before prompt.'),
      schema.node('aiPrompt'),
      paragraph('Current after prompt.'),
    ]);
    invoke.mockResolvedValue({
      'scene-1': proseDocument('Persisted previous prose.'),
    });

    const messages = await service.buildMessages(baseRequest(doc, findNodePos(doc, 'aiPrompt')));

    expect(flushDirtySections).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('manuscript:getScenesProse', { sceneIds: ['scene-1'] });
    expect(messages.map(message => message.role)).toEqual(['user', 'user']);
    expect(messages[0].content).toContain('Full prose:\nPersisted previous prose.');
    expect(messages[0].content).toContain('Prose:\nCurrent before prompt.');
    expect(messages[0].content).not.toContain('Current after prompt.');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Continue the scene.' });
  });

  it('splits an explicitly selected current scene around the AI prompt', async () => {
    const doc = schema.node('doc', null, [
      sceneSummary('scene-1'),
      paragraph('Unsaved editor prose.'),
      schema.node('aiPrompt'),
      paragraph('Prose after prompt.'),
    ]);

    const messages = await service.buildMessages({
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      manuscriptRefs: ['scene:scene-1'],
    });

    expect(flushDirtySections).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(messages[0].content).toContain(
      `Prose:\nUnsaved editor prose.\n\n${AFTER_PROSE_NOTE}\n\nProse after prompt.`,
    );
    expect(messages[0].content.match(/FOLLOWING PROSE AND ANY SUBSEQUENT/g)).toHaveLength(1);
  });

  it('splits the current scene when it is included through a selected chapter', async () => {
    const doc = schema.node('doc', null, [
      sceneSummary('scene-1'),
      paragraph('Current before prompt.'),
      schema.node('aiPrompt'),
      paragraph('Current after prompt.'),
      sceneSummary('scene-2'),
      paragraph('Later selected scene.'),
    ]);

    const messages = await service.buildMessages({
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      manuscriptRefs: ['chapter:chapter-1'],
    });
    const context = messages[0].content;

    expect(context).toContain(
      `Prose:\nCurrent before prompt.\n\n${AFTER_PROSE_NOTE}\n\nCurrent after prompt.`,
    );
    expect(context).toContain('--- BEGIN SCENE 2 — Scene 2 ---');
    expect(context).toContain('Prose:\nLater selected scene.');
    expect(context.indexOf(AFTER_PROSE_NOTE)).toBeLessThan(
      context.indexOf('Later selected scene.'),
    );
    expect(context.match(/FOLLOWING PROSE AND ANY SUBSEQUENT/g)).toHaveLength(1);
  });

  it('loads the outline without flushing prose when no unloaded scene prose is requested', async () => {
    const doc = schema.node('doc', null, [sceneSummary('scene-1'), schema.node('aiPrompt')]);
    invoke.mockResolvedValue(createHierarchy());

    const messages = await service.buildMessages({
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      includeFullOutline: true,
    });

    expect(flushDirtySections).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('manuscript:getOutline', { bookId: 'book-1' });
    expect(messages[0].content).toContain('## Full Outline');
    expect(messages[0].content).not.toContain('\nProse:');
  });

  it('loads selected prose from the database alongside the full outline', async () => {
    const doc = schema.node('doc', null, [
      sceneSummary('scene-1'),
      schema.node('sceneSkeleton'),
      sceneSummary('scene-2'),
      schema.node('aiPrompt'),
    ]);
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'manuscript:getOutline') return createHierarchy();
      if (channel === 'manuscript:getScenesProse') {
        return { 'scene-1': proseDocument('Selected persisted prose.') };
      }
      return undefined;
    });

    const messages = await service.buildMessages({
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      includeFullOutline: true,
      manuscriptRefs: ['scene:scene-1'],
    });

    expect(flushDirtySections).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('manuscript:getOutline', { bookId: 'book-1' });
    expect(invoke).toHaveBeenCalledWith('manuscript:getScenesProse', { sceneIds: ['scene-1'] });
    expect(messages[0].content).toContain('## Full Outline');
    expect(messages[0].content).toContain('Prose:\nSelected persisted prose.');
  });

  it('merges and deduplicates manual and automatic Codex entries before serialization', async () => {
    const doc = schema.node('doc', null, [
      sceneSummary('scene-1'),
      schema.node('aiPrompt'),
    ]);
    getEntry.mockImplementation(async (id: string) => ({
      ...cachedCodexEntry(),
      id,
      name: id === 'codex-1' ? 'Mara' : 'The Silver Key',
      entryNotes: [],
      entryProgression: [],
    }));

    const messages = await service.buildMessages({
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      manualCodexEntryIds: ['codex-1'],
      automaticCodexEntryIds: new Set(['codex-1', 'codex-2']),
      codexEntries: [cachedCodexEntry(), cachedCodexEntry({
        id: 'codex-2',
        name: 'The Silver Key',
        trackingSetting: 'always_include',
      })],
    });

    expect(getEntry).toHaveBeenCalledTimes(2);
    expect(getEntry).toHaveBeenNthCalledWith(1, 'codex-1');
    expect(getEntry).toHaveBeenNthCalledWith(2, 'codex-2');
    expect(messages[0].content.match(/--- BEGIN CODEX ENTRY ---/g)).toHaveLength(2);
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Continue the scene.' });
  });

  it('uses the book POV for global prompts and omits a null POV character', async () => {
    const doc = schema.node('doc', null, [schema.node('aiPrompt')]);

    const messages = await service.buildMessages(baseRequest(doc, findNodePos(doc, 'aiPrompt')));

    expect(messages[0].content).toContain('## Narrative Guidance');
    expect(messages[0].content).toContain('Point of View: Third Person Omniscient');
    expect(messages[0].content).toContain('Minimum Length: Write at least 500 words.');
    expect(messages[0].content).not.toContain('POV Character:');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Continue the scene.' });
  });

  it('includes the requested minimum word count in narrative guidance', async () => {
    const doc = schema.node('doc', null, [schema.node('aiPrompt')]);

    const messages = await service.buildMessages({
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      wordCount: 1250,
    });

    expect(messages[0].content).toContain('Minimum Length: Write at least 1250 words.');
  });

  it('lets the model choose the length when word count is automatic', async () => {
    const doc = schema.node('doc', null, [schema.node('aiPrompt')]);

    const messages = await service.buildMessages({
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      wordCount: 0,
    });

    expect(messages[0].content).not.toContain('Minimum Length:');
  });

  it('uses a prompt POV override and defaults a missing book to third-person limited', async () => {
    const doc = schema.node('doc', null, [schema.node('aiPrompt')]);
    const promptPos = findNodePos(doc, 'aiPrompt');

    const overridden = await service.buildMessages({
      ...baseRequest(doc, promptPos),
      pointOfView: 'first',
    });
    expect(overridden[0].content).toContain('Point of View: First Person');

    books.mockReturnValue([]);
    const defaulted = await service.buildMessages(baseRequest(doc, promptPos));
    expect(defaulted[0].content).toContain('Point of View: Third Person Limited');
  });

  it('includes a selected POV character once in guidance and eligible Codex context', async () => {
    const doc = schema.node('doc', null, [sceneSummary('scene-1'), schema.node('aiPrompt')]);
    getEntry.mockResolvedValue({
      ...cachedCodexEntry(),
      description: 'Carries the silver key.',
      entryNotes: [],
      entryProgression: [],
    });

    const messages = await service.buildMessages({
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      pointOfView: 'first',
      povCharacterId: 'codex-1',
      manualCodexEntryIds: ['codex-1'],
      codexEntries: [cachedCodexEntry()],
    });

    expect(getEntry).toHaveBeenCalledOnce();
    expect(getEntry).toHaveBeenCalledWith('codex-1');
    expect(messages[0].content).toContain('Point of View: First Person');
    expect(messages[0].content).toContain('POV Character: Mara');
    expect(messages[0].content).toContain('Description:\nCarries the silver key.');
    expect(messages[0].content.match(/--- BEGIN CODEX ENTRY ---/g)).toHaveLength(1);
  });

  it('omits an unresolved character and withholds never-include character details', async () => {
    const doc = schema.node('doc', null, [schema.node('aiPrompt')]);
    const promptPos = findNodePos(doc, 'aiPrompt');

    const unresolved = await service.buildMessages({
      ...baseRequest(doc, promptPos),
      povCharacterId: 'missing-character',
    });
    expect(unresolved[0].content).not.toContain('POV Character:');

    const neverIncluded = await service.buildMessages({
      ...baseRequest(doc, promptPos),
      povCharacterId: 'codex-1',
      codexEntries: [cachedCodexEntry({ trackingSetting: 'never_include' })],
    });
    expect(neverIncluded[0].content).toContain('POV Character: Mara');
    expect(neverIncluded[0].content).not.toContain('## Codex Context');
    expect(getEntry).not.toHaveBeenCalled();
  });

  it('skips missing Codex details and propagates context transport failures', async () => {
    const doc = schema.node('doc', null, [schema.node('aiPrompt')]);
    const request = {
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      manualCodexEntryIds: ['codex-1'],
      codexEntries: [cachedCodexEntry()],
    };

    const messages = await service.buildMessages(request);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain('Point of View: Third Person Omniscient');
    expect(messages.at(-1)?.content).toBe('Continue the scene.');

    getEntry.mockRejectedValueOnce(new Error('Codex unavailable'));
    await expect(service.buildMessages(request)).rejects.toThrow('Codex unavailable');
  });

  it('adds the top similar manuscript paragraphs before the author prompt', async () => {
    const doc = schema.node('doc', null, [sceneSummary('scene-1'), schema.node('aiPrompt')]);
    searchSimilarParagraphs.mockResolvedValue([{
      paragraphId: 'paragraph-1',
      actId: 'act-1',
      chapterId: 'chapter-1',
      sceneId: 'scene-1',
      text: 'Mara found the silver key.',
      distance: 0.12,
    }]);

    const messages = await service.buildMessages({
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      vectorSearch: 'enabled',
    });

    expect(flushDirtySections).toHaveBeenCalledOnce();
    expect(flushParagraphVectorChanges).toHaveBeenCalledOnce();
    expect(searchSimilarParagraphs).toHaveBeenCalledWith({
      bookId: 'book-1',
      query: 'Continue the scene.',
      limit: 3,
    });
    expect(messages[0].content).toContain('## Semantically Relevant Manuscript Paragraphs');
    expect(messages[0].content).toContain(
      'Treat them as optional reference material, not content that must appear in the response.',
    );
    expect(messages[0].content).toContain(
      '1. [Act 1: Act One > Chapter 1: Chapter One > Scene 1: Scene 1]',
    );
    expect(messages[0].content).toContain('Mara found the silver key.');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Continue the scene.' });
  });

  it('omits missing titles from vector-context hierarchy labels', async () => {
    const doc = schema.node('doc', null, [schema.node('aiPrompt')]);
    const hierarchy = createHierarchy();
    hierarchy[0].title = '';
    hierarchy[0].chapters![0].scenes![0].title = '  ';
    searchSimilarParagraphs.mockResolvedValue([{
      paragraphId: 'paragraph-1',
      actId: 'act-1',
      chapterId: 'chapter-1',
      sceneId: 'scene-1',
      text: 'Mara found the silver key.',
      distance: 0.12,
    }]);

    const messages = await service.buildMessages({
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      hierarchy,
      vectorSearch: 'enabled',
    });

    expect(messages[0].content).toContain(
      '1. [Act 1 > Chapter 1: Chapter One > Scene 1]',
    );
  });

  it('warns and continues without vector context when search fails', async () => {
    const doc = schema.node('doc', null, [schema.node('aiPrompt')]);
    searchSimilarParagraphs.mockRejectedValue(new Error('Embedding provider unavailable'));

    const messages = await service.buildMessages({
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      vectorSearch: 'enabled',
    });

    expect(warning).toHaveBeenCalledOnce();
    expect(messages[0].content).not.toContain('Semantically Relevant Manuscript Paragraphs');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Continue the scene.' });
  });

  it('resolves global vector search from the book setting', async () => {
    const doc = schema.node('doc', null, [schema.node('aiPrompt')]);
    const request = {
      ...baseRequest(doc, findNodePos(doc, 'aiPrompt')),
      vectorSearch: 'global' as const,
    };

    books.mockReturnValue([{
      id: 'book-1',
      settings: { pointOfView: 'third_omni', vectorSearchEnabled: false },
    }]);
    await service.buildMessages(request);
    expect(searchSimilarParagraphs).not.toHaveBeenCalled();

    books.mockReturnValue([{
      id: 'book-1',
      settings: { pointOfView: 'third_omni', vectorSearchEnabled: true },
    }]);
    await service.buildMessages(request);
    expect(searchSimilarParagraphs).toHaveBeenCalledWith({
      bookId: 'book-1',
      query: 'Continue the scene.',
      limit: 3,
    });
  });
});

const schema = new Schema({
  nodes: {
    doc: { content: 'block*' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*' },
    sceneSummary: { group: 'block', atom: true, attrs: { id: { default: '' } } },
    sceneSkeleton: { group: 'block', atom: true },
    aiPrompt: { group: 'block', atom: true, attrs: { id: { default: 'prompt-1' } } },
  },
});

function baseRequest(doc: ProseMirrorNode, promptPos: number) {
  return {
    editor: { state: { doc } } as Editor,
    promptPos,
    promptId: 'prompt-1',
    promptText: 'Continue the scene.',
    bookId: 'book-1',
    bookTitle: 'Book One',
    hierarchy: createHierarchy(),
    includeFullOutline: false,
    manuscriptRefs: [],
    manualCodexEntryIds: [],
    automaticCodexEntryIds: new Set<string>(),
    codexEntries: [],
    wordCount: 500,
    pointOfView: 'global',
    povCharacterId: null,
    vectorSearch: 'disabled',
  } as const;
}

function sceneSummary(id: string): ProseMirrorNode {
  return schema.node('sceneSummary', { id });
}

function paragraph(text: string): ProseMirrorNode {
  return schema.node('paragraph', null, schema.text(text));
}

function findNodePos(doc: ProseMirrorNode, type: string): number {
  let result = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === type) {
      result = pos;
      return false;
    }
    return true;
  });
  return result;
}

function proseDocument(text: string) {
  return {
    type: 'doc' as const,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

function createHierarchy(): ActDto[] {
  const scenes = [createScene('scene-1', 0), createScene('scene-2', 1)];
  const chapter: ChapterDto = {
    id: 'chapter-1',
    actId: 'act-1',
    title: 'Chapter One',
    position: 0,
    status: 'active',
    summary: 'Chapter summary.',
    scenes,
  };
  return [{
    id: 'act-1',
    bookId: 'book-1',
    title: 'Act One',
    position: 0,
    status: 'active',
    summary: 'Act summary.',
    chapters: [chapter],
  }];
}

function createScene(id: string, position: number): SceneDto {
  return {
    id,
    chapterId: 'chapter-1',
    title: `Scene ${position + 1}`,
    position,
    status: 'active',
    prose: null,
    summary: `Scene ${position + 1} summary.`,
    wordCount: 0,
    pointOfViewOverride: null,
    povCharacterIdOverride: null,
  };
}

function cachedCodexEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'codex-1',
    bookId: 'book-1',
    type: 'character' as const,
    name: 'Mara',
    alias: null,
    description: null,
    image: null,
    status: 'active' as const,
    trackingSetting: 'manual' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
