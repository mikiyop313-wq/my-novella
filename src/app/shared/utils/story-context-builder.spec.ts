import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { CodexEntryDetailDto } from '../../../../shared/models/codex.model';
import type {
  ActDto,
  ChapterDto,
  SceneDto,
} from '../../../../shared/models/manuscript.model';
import {
  buildSelectionEditContext,
  expandManuscriptRefs,
  findCurrentSceneIdBeforePosition,
  findPreviousSceneId,
  serializeCodexContext,
  serializeFullOutline,
  serializeNarrativeGuidance,
  serializePartialOutline,
  serializeSelectedManuscript,
  serializeTiptapDocument,
} from './story-context-builder';

const AFTER_CONTEXT_NOTE = '[THE FOLLOWING MANUSCRIPT CONTEXT OCCURS AFTER THE INSERTION POINT. USE IT ONLY AS FUTURE CONTEXT.]';
const AFTER_PROSE_NOTE = '[THE FOLLOWING PROSE AND ANY SUBSEQUENT SCENES, CHAPTERS, OR ACTS OCCUR AFTER THE INSERTION POINT. USE THEM ONLY AS FUTURE CONTEXT.]';

describe('Story context builder', () => {
  it('expands structural references without duplicating scenes', () => {
    const hierarchy = createHierarchy();

    expect([
      ...expandManuscriptRefs(hierarchy, ['act:act-1', 'chapter:chapter-1', 'scene:scene-1']),
    ]).toEqual(['scene-1', 'scene-2']);
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
    expect(result).toContain(
      '--- BEGIN SCENE 2 ---\n\nSummary:\nSecond summary.\n\nProse:\nSelected prose.',
    );
    expect(result.match(/Selected prose\./g)).toHaveLength(1);
  });

  it('excludes disabled scenes from refs, outlines, and previous-scene lookup', () => {
    const hierarchy = createHierarchy();
    hierarchy[0].chapters![0].scenes![1].includeInContext = false;

    expect([...expandManuscriptRefs(hierarchy, ['novel'])]).toEqual(['scene-1', 'scene-3']);
    expect(findPreviousSceneId(hierarchy, 'scene-3')).toBe('scene-1');

    const outline = serializeFullOutline(hierarchy, 'Novel', new Map());
    expect(outline).toContain('SCENE 1 — Opening');
    expect(outline).not.toContain('Second summary.');
    expect(outline).toContain('SCENE 1 — Ending');
  });

  it('renders an Outline with summaries only for scenes before the current scene', () => {
    const result = serializePartialOutline(
      createHierarchy(),
      'Silver Key',
      'scene-3',
    );

    expect(result).toContain('## Outline');
    expect(result).toContain('--- BEGIN NOVEL — Silver Key ---');
    expect(result).toContain('--- BEGIN ACT 1 — Act One ---');
    expect(result).toContain('--- BEGIN CHAPTER 1 — Chapter One ---');
    expect(result).toContain('--- BEGIN SCENE 1 — Opening ---');
    expect(result).toContain('Summary:\nFirst summary.');
    expect(result).toContain('--- BEGIN SCENE 2 ---');
    expect(result).toContain('Summary:\nSecond summary.');
    expect(result.indexOf('SCENE 1')).toBeLessThan(result.indexOf('SCENE 2'));
    expect(result).not.toContain('Act summary.');
    expect(result).not.toContain('Chapter summary.');
    expect(result).not.toContain('SCENE 1 — Ending');
    expect(result).not.toContain('BEGIN ACT 2');
    expect(result).not.toContain('Prose:');
  });

  it.each([
    ['the first scene', createHierarchy(), 'scene-1'],
    ['an unknown scene', createHierarchy(), 'missing-scene'],
    ['an empty hierarchy', [], 'scene-1'],
  ])('omits the Outline for %s', (_label, hierarchy, currentSceneId) => {
    expect(serializePartialOutline(hierarchy, 'Silver Key', currentSceneId)).toBe('');
  });

  it('embeds the current scene edit content when provided', () => {
    const result = serializePartialOutline(
      createHierarchy(),
      'Silver Key',
      'scene-2',
      {
        currentSceneProse:
          'Before.\n\n--- PASSAGE TO EDIT ---\nSelected.\n--- END PASSAGE ---\n\nAfter.',
      },
    );

    expect(result).toContain('--- BEGIN SCENE 1');
    expect(result).toContain(
      '--- BEGIN SCENE 2 ---\n\nProse:\nBefore.\n\n' +
      '--- PASSAGE TO EDIT ---\nSelected.\n--- END PASSAGE ---\n\nAfter.\n\n--- END SCENE 2 ---',
    );
    expect(result).not.toContain('Second summary.');
  });

  it('renders selected prose as manuscript context with only its parent structure', () => {
    const hierarchy = createHierarchy();
    const selected = new Set(['scene-2']);
    const result = serializeSelectedManuscript(
      hierarchy,
      'Silver Key',
      selected,
      new Map([['scene-2', 'Only this scene.']]),
    );

    expect(result).toContain('## Manuscript Context');
    expect(result).not.toContain('## Outline');
    expect(result).not.toContain('## Full Outline');
    expect(result).toContain('--- BEGIN ACT 1 — Act One ---');
    expect(result).toContain('--- BEGIN CHAPTER 1 — Chapter One ---');
    expect(result).toContain('--- BEGIN SCENE 2 ---');
    expect(result).toContain('BEGIN NOVEL');
    expect(result).not.toContain('SCENE 1');
    expect(result).not.toContain('Summary:');
  });

  it('groups selected scenes from one chapter without duplicating parent delimiters', () => {
    const result = serializeSelectedManuscript(
      createHierarchy(),
      'Silver Key',
      new Set(['scene-2', 'scene-1']),
      new Map([
        ['scene-2', 'Second selected scene.'],
        ['scene-1', 'First selected scene.'],
      ]),
    );

    expect(result.match(/--- BEGIN NOVEL/g)).toHaveLength(1);
    expect(result.match(/--- BEGIN ACT 1/g)).toHaveLength(1);
    expect(result.match(/--- BEGIN CHAPTER 1/g)).toHaveLength(1);
    expect(result.match(/--- END CHAPTER 1/g)).toHaveLength(1);
    expect(result.match(/--- END ACT 1/g)).toHaveLength(1);
    expect(result.indexOf('First selected scene.')).toBeLessThan(
      result.indexOf('Second selected scene.'),
    );
  });

  it('keeps only applicable parents for selected scenes across acts', () => {
    const result = serializeSelectedManuscript(
      createHierarchy(),
      'Silver Key',
      new Set(['scene-3', 'scene-2']),
      new Map([
        ['scene-3', 'Later act scene.'],
        ['scene-2', 'Earlier act scene.'],
      ]),
    );

    expect(result.match(/--- BEGIN ACT 1/g)).toHaveLength(1);
    expect(result.match(/--- BEGIN ACT 2/g)).toHaveLength(1);
    expect(result.match(/--- BEGIN CHAPTER 1 — Chapter One/g)).toHaveLength(1);
    expect(result.match(/--- BEGIN CHAPTER 1 ---/g)).toHaveLength(1);
    expect(result).not.toContain('SCENE 1 — Opening');
    expect(result.indexOf('Earlier act scene.')).toBeLessThan(
      result.indexOf('Later act scene.'),
    );
  });

  it('omits manuscript context when selected scene references are unavailable', () => {
    expect(serializeSelectedManuscript(
      createHierarchy(),
      'Silver Key',
      new Set(['missing-scene']),
      new Map([['missing-scene', 'Unavailable scene prose.']]),
    )).toBe('');
  });

  it('places one prompt boundary inside a selected current scene with remaining prose', () => {
    const hierarchy = createHierarchy();
    const result = serializeSelectedManuscript(
      hierarchy,
      'Silver Key',
      new Set(['scene-2', 'scene-3']),
      new Map([
        ['scene-2', 'Before. After.'],
        ['scene-3', 'Later scene.'],
      ]),
      {
        sceneId: 'scene-2',
        beforePromptProse: 'Before.',
        afterPromptProse: 'After.',
      },
    );

    expect(result).toContain(`Prose:\nBefore.\n\n${AFTER_PROSE_NOTE}\n\nAfter.`);
    expect(result.indexOf(AFTER_PROSE_NOTE)).toBeLessThan(result.indexOf('Later scene.'));
    expect(result.match(/FOLLOWING PROSE AND ANY SUBSEQUENT/g)).toHaveLength(1);
  });

  it('places the boundary before a wholly later selected act', () => {
    const hierarchy = createHierarchy();
    const result = serializeSelectedManuscript(
      hierarchy,
      'Silver Key',
      new Set(['scene-1', 'scene-3']),
      new Map([
        ['scene-1', 'Earlier act prose.'],
        ['scene-3', 'Later act prose.'],
      ]),
      {
        sceneId: 'scene-2',
        beforePromptProse: 'Current prose.',
        afterPromptProse: '',
      },
    );

    expect(result.indexOf('--- END ACT 1 — Act One ---')).toBeLessThan(
      result.indexOf(AFTER_CONTEXT_NOTE),
    );
    expect(result.indexOf(AFTER_CONTEXT_NOTE)).toBeLessThan(result.indexOf('--- BEGIN ACT 2 ---'));
    expect(result).toContain('Prose:\nLater act prose.');
    expect(result.match(/FOLLOWING MANUSCRIPT CONTEXT/g)).toHaveLength(1);
  });

  it('places the boundary before a wholly later selected chapter', () => {
    const hierarchy = createHierarchy();
    hierarchy[0].chapters?.push(
      createChapter('chapter-later', 'Later Chapter', 1, null, [
        createScene('scene-later', 'Later Scene', 0, null),
      ]),
    );
    const result = serializeSelectedManuscript(
      hierarchy,
      'Silver Key',
      new Set(['scene-1', 'scene-later']),
      new Map([
        ['scene-1', 'Earlier chapter prose.'],
        ['scene-later', 'Later chapter prose.'],
      ]),
      {
        sceneId: 'scene-2',
        beforePromptProse: 'Current prose.',
        afterPromptProse: '',
      },
    );

    expect(result.indexOf('--- END CHAPTER 1 — Chapter One ---')).toBeLessThan(
      result.indexOf(AFTER_CONTEXT_NOTE),
    );
    expect(result.indexOf(AFTER_CONTEXT_NOTE)).toBeLessThan(
      result.indexOf('--- BEGIN CHAPTER 2 — Later Chapter ---'),
    );
    expect(result.match(/FOLLOWING MANUSCRIPT CONTEXT/g)).toHaveLength(1);
  });

  it('places the boundary between an earlier selected scene and a later one', () => {
    const hierarchy = createHierarchy();
    hierarchy[0].chapters?.[0].scenes?.push(
      createScene('scene-later', 'Later Scene', 2, null),
    );
    const result = serializeSelectedManuscript(
      hierarchy,
      'Silver Key',
      new Set(['scene-1', 'scene-later']),
      new Map([
        ['scene-1', 'Earlier scene prose.'],
        ['scene-later', 'Later scene prose.'],
      ]),
      {
        sceneId: 'scene-2',
        beforePromptProse: 'Current prose.',
        afterPromptProse: '',
      },
    );

    expect(result.indexOf('--- END SCENE 1 — Opening ---')).toBeLessThan(
      result.indexOf(AFTER_CONTEXT_NOTE),
    );
    expect(result.indexOf(AFTER_CONTEXT_NOTE)).toBeLessThan(
      result.indexOf('--- BEGIN SCENE 3 — Later Scene ---'),
    );
    expect(result.match(/FOLLOWING MANUSCRIPT CONTEXT/g)).toHaveLength(1);
  });

  it('does not render a boundary when selected context has nothing after the prompt', () => {
    const hierarchy = createHierarchy();
    const result = serializeSelectedManuscript(
      hierarchy,
      'Silver Key',
      new Set(['scene-1', 'scene-2']),
      new Map([
        ['scene-1', 'Earlier prose.'],
        ['scene-2', 'Current prose.'],
      ]),
      {
        sceneId: 'scene-2',
        beforePromptProse: 'Current prose.',
        afterPromptProse: '',
      },
    );

    expect(result).toContain('Prose:\nCurrent prose.');
    expect(result).not.toContain('AFTER THE INSERTION POINT');
  });

  it('places future full-outline acts and summaries after the prompt boundary', () => {
    const result = serializeFullOutline(
      createHierarchy(),
      'Silver Key',
      new Map(),
      {
        sceneId: 'scene-2',
        beforePromptProse: 'Current prose.',
        afterPromptProse: '',
      },
    );

    expect(result.indexOf(AFTER_CONTEXT_NOTE)).toBeLessThan(result.indexOf('--- BEGIN ACT 2 ---'));
    expect(result.indexOf('Second summary.')).toBeLessThan(result.indexOf(AFTER_CONTEXT_NOTE));
    expect(result.match(/FOLLOWING MANUSCRIPT CONTEXT/g)).toHaveLength(1);
  });

  it('splits selected current prose while retaining the full outline', () => {
    const result = serializeFullOutline(
      createHierarchy(),
      'Silver Key',
      new Map([['scene-2', 'Before. After.']]),
      {
        sceneId: 'scene-2',
        beforePromptProse: 'Before.',
        afterPromptProse: 'After.',
      },
    );

    expect(result).toContain('Summary:\nSecond summary.');
    expect(result).toContain(`Prose:\nBefore.\n\n${AFTER_PROSE_NOTE}\n\nAfter.`);
    expect(result.indexOf('Second summary.')).toBeLessThan(result.indexOf(AFTER_PROSE_NOTE));
    expect(result.match(/FOLLOWING PROSE AND ANY SUBSEQUENT/g)).toHaveLength(1);
  });

  it('merges previous and current prose into one partial outline hierarchy', () => {
    const result = serializePartialOutline(
      createHierarchy(),
      'Silver Key',
      'scene-3',
      {
        previousScene: { sceneId: 'scene-2', prose: 'Previous.' },
        currentSceneProse: 'Current.',
      },
    );

    expect(result).toContain('## Outline');
    expect(result).not.toContain('Automatic Manuscript Context');
    expect(result.match(/--- BEGIN ACT 1/g)).toHaveLength(1);
    expect(result.indexOf('Previous.')).toBeLessThan(result.indexOf('Current.'));
    expect(result).toContain('Full prose:\nPrevious.');
    expect(result).toContain('Prose:\nCurrent.');
    expect(result).toContain('--- BEGIN ACT 2 ---');
  });

  it.each([
    ['first', 'First Person'],
    ['second', 'Second Person'],
    ['third_limited', 'Third Person Limited'],
    ['third_omni', 'Third Person Omniscient'],
  ] as const)('renders the %s point of view as %s', (pointOfView, label) => {
    expect(serializeNarrativeGuidance(pointOfView, null, 500)).toBe(
      `## Narrative Guidance\n\nPoint of View: ${label}\nMinimum Length: Write at least 500 words.`,
    );
  });

  it('adds a resolved POV character and omits an empty one', () => {
    expect(serializeNarrativeGuidance('first', '  Mara  ', 500)).toContain(
      'POV Character: Mara',
    );
    expect(serializeNarrativeGuidance('first', null, 500)).not.toContain('POV Character:');
    expect(serializeNarrativeGuidance('first', '   ', 500)).not.toContain('POV Character:');
  });

  it('renders the requested minimum output length', () => {
    expect(serializeNarrativeGuidance('third_limited', null, 1250)).toContain(
      'Minimum Length: Write at least 1250 words.',
    );
  });

  it('omits minimum output length when word count is automatic', () => {
    expect(serializeNarrativeGuidance('third_limited', null, 0)).toBe(
      '## Narrative Guidance\n\nPoint of View: Third Person Limited',
    );
  });

  it('finds the current scene before the prompt position', () => {
    const doc = manuscriptDoc();
    const promptPos = findNodePos(doc, 'aiPrompt');

    expect(findCurrentSceneIdBeforePosition(doc, promptPos)).toBe('scene-2');
  });

  it('excludes context-only nodes from JSON prose', () => {
    expect(
      serializeTiptapDocument({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Keep.' }] },
          {
            type: 'aiGeneratedBlock',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Exclude.' }] }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Line one' },
              { type: 'hardBreak' },
              { type: 'text', text: 'Line two' },
            ],
          },
        ],
      }),
    ).toBe('Keep.\n\nLine one\nLine two');
  });

  it('builds exact scene-local edit context without the scene summary', () => {
    const doc = schema.node('doc', null, [
      sceneSummary('scene-1', 'The Confrontation', 'This summary must not be included.'),
      paragraph('Mara entered the room.'),
      paragraph('Elias would not meet her eyes.'),
      paragraph('The others waited outside.'),
      sceneSummary('scene-2', 'Aftermath', 'Later summary.'),
      paragraph('Later prose must not be included.'),
    ]);
    const selectedText = 'Elias would not meet her eyes.';
    const from = findTextPos(doc, selectedText);

    expect(buildSelectionEditContext(
      doc,
      { from, to: from + selectedText.length },
    )).toEqual({
      sceneId: 'scene-1',
      sceneContent: `Mara entered the room.

--- PASSAGE TO EDIT ---
Elias would not meet her eyes.
--- END PASSAGE ---

The others waited outside.`,
      selectedProse: 'Elias would not meet her eyes.',
      storyContext: `Scene: The Confrontation

Mara entered the room.

--- PASSAGE TO EDIT ---
Elias would not meet her eyes.
--- END PASSAGE ---

The others waited outside.`,
    });
  });

  it('places partial outline before scene context and Codex context after it', () => {
    const doc = schema.node('doc', null, [
      sceneSummary('scene-1', 'The Confrontation', 'Scene summary.'),
      paragraph('Mara entered the room.'),
      paragraph('Elias would not meet her eyes.'),
      paragraph('The others waited outside.'),
    ]);
    const selectedText = 'Elias would not meet her eyes.';
    const from = findTextPos(doc, selectedText);
    const result = buildSelectionEditContext(
      doc,
      { from, to: from + selectedText.length },
      {
        partialOutline: '## Outline\n\nEarlier scene summary.',
        codexContext: '## Codex Context\n\nMara Vale.',
      },
    );

    expect(result?.storyContext).toContain(
      '## Outline\n\nEarlier scene summary.\nScene: The Confrontation',
    );
    expect(result?.storyContext.indexOf('--- END PASSAGE ---')).toBeLessThan(
      result?.storyContext.indexOf('## Codex Context') ?? -1,
    );
    expect(result?.storyContext).toContain('## Codex Context');
  });

  it('rejects rephrase selections outside one scene', () => {
    const doc = schema.node('doc', null, [
      paragraph('Outside prose.'),
      sceneSummary('scene-1'),
      paragraph('First passage.'),
      sceneSummary('scene-2'),
      paragraph('Second passage.'),
    ]);
    const outsideFrom = findTextPos(doc, 'Outside prose.');
    const firstFrom = findTextPos(doc, 'First passage.');
    const secondFrom = findTextPos(doc, 'Second passage.');

    expect(buildSelectionEditContext(doc, {
      from: outsideFrom,
      to: outsideFrom + 'Outside'.length,
    })).toBeNull();
    expect(buildSelectionEditContext(doc, {
      from: firstFrom,
      to: secondFrom + 'Second'.length,
    })).toBeNull();
  });

  it('serializes only progression at or before the current active scene', () => {
    const entry = createCodexEntry();
    const result = serializeCodexContext([entry], createHierarchy(), 'scene-2');

    expect(result).toContain('--- BEGIN CODEX CONTEXT ---');
    expect(result).toContain('--- CHARACTER ---');
    expect(result).toContain('--- END CODEX CONTEXT ---');
    expect(result).toContain('Aliases: Mara, The Courier');
    expect(result).toContain(
      '- [Act 1 — Act One > Chapter 1 — Chapter One > Scene 1 — Opening] Introduced: She finds the key.',
    );
    expect(result).toContain(
      '- [Act 1 — Act One > Chapter 1 — Chapter One > Scene 2] Known: She has the key.',
    );
    expect(result.indexOf('Introduced:')).toBeLessThan(result.indexOf('Known:'));
    expect(result).not.toContain('Future');
    expect(result).not.toContain('Unlinked');
    expect(result).not.toContain('Private note');
  });

  it('groups Codex entries by type inside one context wrapper', () => {
    const character = createCodexEntry();
    const location: CodexEntryDetailDto = {
      ...createCodexEntry(),
      id: 'codex-location',
      type: 'location',
      name: 'Nocturne Academy',
      alias: null,
      description: 'An isolated academy.',
      entryProgression: [],
    };
    const result = serializeCodexContext(
      [character, location],
      createHierarchy(),
      'scene-2',
    );

    expect(result.match(/--- BEGIN CODEX CONTEXT ---/g)).toHaveLength(1);
    expect(result.match(/--- END CODEX CONTEXT ---/g)).toHaveLength(1);
    expect(result.match(/--- CHARACTER ---/g)).toHaveLength(1);
    expect(result.match(/--- LOCATION ---/g)).toHaveLength(1);
    expect(result.indexOf('### Mara')).toBeLessThan(result.indexOf('--- LOCATION ---'));
    expect(result).toContain('### Nocturne Academy');
    expect(result).not.toContain('Name:');
    expect(result).not.toContain('BEGIN CODEX ENTRY');
  });
});

const schema = new Schema({
  nodes: {
    doc: { content: 'block*' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*' },
    actHeader: { group: 'block', atom: true, attrs: { id: { default: '' } } },
    chapterHeader: { group: 'block', atom: true, attrs: { id: { default: '' } } },
    sceneSummary: {
      group: 'block',
      atom: true,
      attrs: {
        id: { default: '' },
        title: { default: '' },
        summary: { default: '' },
      },
    },
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

function sceneSummary(id: string, title = '', summary = ''): ProseMirrorNode {
  return schema.node('sceneSummary', { id, title, summary });
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

function findTextPos(doc: ProseMirrorNode, text: string): number {
  let result = -1;
  doc.descendants((node, pos) => {
    if (result < 0 && node.isText && node.text?.includes(text)) {
      result = pos + node.text.indexOf(text);
    }
  });
  if (result < 0) throw new Error(`Text not found: ${text}`);
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
    wordCount: summary ? 0 : 1,
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
    entryNotes: [
      {
        id: 'note-1',
        codexEntryId: 'codex-1',
        content: 'Private note',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastEditedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    entryProgression: [
      progression('Introduced', 'She finds the key.', 'scene-1'),
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
