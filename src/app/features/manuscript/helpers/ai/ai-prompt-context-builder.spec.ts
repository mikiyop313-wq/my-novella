import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { CodexEntryDetailDto } from '../../../../../../shared/models/codex.model';
import type { ActDto, ChapterDto, SceneDto } from '../../../../../../shared/models/manuscript.model';
import {
  expandManuscriptRefs,
  findCurrentSceneIdBeforePosition,
  findPreviousSceneId,
  serializeAutomaticManuscript,
  serializeCodexContext,
  serializeFullOutline,
  serializeSelectedManuscript,
  serializeTiptapDocument,
} from './ai-prompt-context-builder';

describe('AI prompt context builder', () => {
  it('expands structural references without duplicating scenes', () => {
    const hierarchy = createHierarchy();

    expect([...expandManuscriptRefs(hierarchy, [
      'act:act-1',
      'chapter:chapter-1',
      'scene:scene-1',
    ])]).toEqual(['scene-1', 'scene-2']);
    expect(findPreviousSceneId(hierarchy, 'scene-3')).toBe('scene-2');
  });

  it('renders a complete Full Outline and overlays prose only on selected scenes', () => {
    const result = serializeFullOutline(
      createHierarchy(),
      'Silver Key',
      new Map([['scene-2', 'Selected prose.']]),
    );

    expect(result).toContain('## Full Outline');
    expect(result).toContain('--- BEGIN NOVEL — Silver Key ---');
    expect(result).toContain('--- BEGIN ACT 1 — Act One ---');
    expect(result).toContain('Summary:\nAct summary.');
    expect(result).toContain('--- BEGIN SCENE 2 ---\n\nSummary:\nSecond summary.\n\nProse:\nSelected prose.');
    expect(result.match(/Selected prose\./g)).toHaveLength(1);
  });

  it('renders a pruned selected tree without summaries or an unnecessary novel wrapper', () => {
    const hierarchy = createHierarchy();
    const selected = new Set(['scene-2']);
    const result = serializeSelectedManuscript(
      hierarchy,
      'Silver Key',
      ['scene:scene-2'],
      selected,
      new Map([['scene-2', 'Only this scene.']]),
    );

    expect(result).toContain('## Selected Manuscript Context');
    expect(result).toContain('--- BEGIN ACT 1 — Act One ---');
    expect(result).toContain('--- BEGIN CHAPTER 1 — Chapter One ---');
    expect(result).toContain('--- BEGIN SCENE 2 ---');
    expect(result).not.toContain('BEGIN NOVEL');
    expect(result).not.toContain('SCENE 1');
    expect(result).not.toContain('Summary:');
  });

  it('renders automatic scenes in hierarchy order with their distinct labels', () => {
    const result = serializeAutomaticManuscript(createHierarchy(), new Map([
      ['scene-3', { label: 'Prose before AI prompt', text: 'Current.' }],
      ['scene-2', { label: 'Full prose', text: 'Previous.' }],
    ]));

    expect(result.indexOf('Previous.')).toBeLessThan(result.indexOf('Current.'));
    expect(result).toContain('Full prose:\nPrevious.');
    expect(result).toContain('Prose before AI prompt:\nCurrent.');
    expect(result).toContain('--- BEGIN ACT 2 ---');
  });

  it('finds the current scene before the prompt position', () => {
    const doc = manuscriptDoc();
    const promptPos = findNodePos(doc, 'aiPrompt');

    expect(findCurrentSceneIdBeforePosition(doc, promptPos)).toBe('scene-2');
  });

  it('excludes context-only nodes from JSON prose', () => {
    expect(serializeTiptapDocument({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep.' }] },
        {
          type: 'aiGeneratedBlock',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Exclude.' }] }],
        },
        { type: 'paragraph', content: [
          { type: 'text', text: 'Line one' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Line two' },
        ] },
      ],
    })).toBe('Keep.\n\nLine one\nLine two');
  });

  it('serializes only progression at or before the current active scene', () => {
    const entry = createCodexEntry();
    const result = serializeCodexContext([entry], createHierarchy(), 'scene-2');

    expect(result).toContain('Type: Character');
    expect(result).toContain('Aliases: Mara, The Courier');
    expect(result).toContain('Known: She has the key.');
    expect(result).not.toContain('Future');
    expect(result).not.toContain('Unlinked');
    expect(result).not.toContain('Private note');
  });
});

const schema = new Schema({
  nodes: {
    doc: { content: 'block*' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*' },
    actHeader: { group: 'block', atom: true, attrs: { id: { default: '' } } },
    chapterHeader: { group: 'block', atom: true, attrs: { id: { default: '' } } },
    sceneSummary: { group: 'block', atom: true, attrs: { id: { default: '' } } },
    sceneSkeleton: { group: 'block', atom: true },
    aiPrompt: { group: 'block', atom: true },
  },
});

function manuscriptDoc(): ProseMirrorNode {
  return schema.node('doc', null, [
    schema.node('actHeader', { id: 'act-1' }),
    schema.node('chapterHeader', { id: 'chapter-1' }),
    sceneSummary('scene-1'),
    paragraph('Previous scene.'),
    sceneSummary('scene-2'),
    paragraph('Before prompt.'),
    schema.node('aiPrompt'),
    paragraph('After prompt.'),
  ]);
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

function createHierarchy(): ActDto[] {
  return [
    createAct('act-1', 'Act One', 0, 'Act summary.', [
      createChapter('chapter-1', 'Chapter One', 0, 'Chapter summary.', [
        createScene('scene-1', 'Opening', 0, 'First summary.'),
        createScene('scene-2', '', 1, 'Second summary.'),
      ]),
    ]),
    createAct('act-2', '', 1, null, [
      createChapter('chapter-2', '', 0, null, [createScene('scene-3', 'Ending', 0, null)]),
    ]),
  ];
}

function createAct(
  id: string,
  title: string,
  position: number,
  summary: string | null,
  chapters: ChapterDto[],
): ActDto {
  return { id, title, position, summary, chapters, bookId: 'book-1', status: 'active' };
}

function createChapter(
  id: string,
  title: string,
  position: number,
  summary: string | null,
  scenes: SceneDto[],
): ChapterDto {
  return { id, title, position, summary, scenes, actId: 'act-1', status: 'active' };
}

function createScene(
  id: string,
  title: string,
  position: number,
  summary: string | null,
): SceneDto {
  return {
    id,
    title,
    position,
    summary,
    chapterId: 'chapter-1',
    status: 'active',
    prose: null,
    wordCount: 0,
    pointOfViewOverride: null,
    povCharacterIdOverride: null,
  };
}

function createCodexEntry(): CodexEntryDetailDto {
  return {
    id: 'codex-1',
    bookId: 'book-1',
    type: 'character',
    name: 'Mara',
    alias: 'Mara, The Courier',
    description: 'Carries the silver key.',
    image: null,
    status: 'active',
    trackingSetting: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    entryNotes: [{
      id: 'note-1',
      codexEntryId: 'codex-1',
      content: 'Private note',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastEditedAt: '2026-01-01T00:00:00.000Z',
    }],
    entryProgression: [
      progression('Known', 'She has the key.', 'scene-2'),
      progression('Future', 'She loses it.', 'scene-3'),
      progression('Unlinked', 'Unknown timing.', null),
    ],
  };
}

function progression(title: string, description: string, sceneId: string | null) {
  return {
    id: `progression-${title}`,
    codexEntryId: 'codex-1',
    title,
    description,
    sceneId,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
  };
}
