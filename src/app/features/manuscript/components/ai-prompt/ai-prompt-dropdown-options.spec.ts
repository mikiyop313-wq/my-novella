import type { CodexEntryDto, CodexEntryType } from '../../../../../../shared/models/codex.model';
import type { ActDto, ChapterDto, SceneDto } from '../../../../../../shared/models/manuscript.model';

import {
  type AiPromptModel,
  buildContextDropdownSections,
  buildModelDropdownSections,
  contextSelectionToValues,
  dropdownValuesToContextSelection,
} from './ai-prompt-dropdown-options';

describe('AI prompt dropdown options', () => {
  it('maps the manuscript hierarchy into aggregate recursive context options', () => {
    const sections = buildContextDropdownSections({
      hierarchy: createHierarchy(),
      codexEntries: [],
      hierarchyLoading: false,
      codexLoading: false,
      hierarchyError: null,
      codexError: null,
    });

    const novel = sections[0].options[1];
    const act = novel.submenu!.sections[0].options[0];
    const chapter = act.submenu!.sections[0].options[0];

    expect(sections[0].title).toBe('Outline & Novel');
    expect(novel.count).toBe(3);
    expect(novel.selectionValues).toEqual(['scene:scene-1', 'scene:scene-2', 'scene:scene-3']);
    expect(act.selectionValues).toEqual(['scene:scene-1', 'scene:scene-2']);
    expect(chapter.submenu!.sections[0].options.map(option => option.label)).toEqual(['Opening', 'Crossroads']);
  });

  it('filters and sorts active Codex entries while retaining aliases for search', () => {
    const sections = buildContextDropdownSections({
      hierarchy: [],
      codexEntries: [
        createCodexEntry('char-2', 'Zara', 'character'),
        createCodexEntry('char-1', 'Ari', 'character', 'active', 'The Protagonist'),
        createCodexEntry('archived', 'Old Hero', 'character', 'archived'),
      ],
      hierarchyLoading: false,
      codexLoading: false,
      hierarchyError: null,
      codexError: null,
    });

    const characters = sections[1].options[0];
    const entries = characters.submenu!.sections[0].options;

    expect(sections[1].dividerBefore).toBe(true);
    expect(characters.count).toBe(2);
    expect(characters.selectionValues).toEqual(['codex:char-1', 'codex:char-2']);
    expect(entries.map(entry => entry.label)).toEqual(['Ari', 'Zara']);
    expect(entries[0].searchTerms).toEqual(['The Protagonist']);
  });

  it('round-trips persisted context state and ignores branch identifiers', () => {
    const values = contextSelectionToValues({
      includeFullOutline: true,
      sceneIds: ['scene-1'],
      codexEntryIds: ['entry-1'],
    });

    expect(values).toEqual(['outline', 'scene:scene-1', 'codex:entry-1']);
    expect(dropdownValuesToContextSelection([...values, 'branch:novel', 'scene:scene-1'])).toEqual({
      includeFullOutline: true,
      sceneIds: ['scene-1'],
      codexEntryIds: ['entry-1'],
    });
  });

  it('exposes loading and error messages without stale selectable branches', () => {
    const sections = buildContextDropdownSections({
      hierarchy: createHierarchy(),
      codexEntries: [createCodexEntry('char-1', 'Ari', 'character')],
      hierarchyLoading: true,
      codexLoading: false,
      hierarchyError: null,
      codexError: 'Codex unavailable',
    });

    expect(sections[0].options.map(option => option.label)).toEqual(['Full Outline']);
    expect(sections[0].message?.text).toBe('Loading novel structure...');
    expect(sections[1].options).toEqual([]);
    expect(sections[1].message).toEqual({ text: 'Codex unavailable', tone: 'error' });
  });

  it('builds direct and OpenRouter submenus with independent main and section titles', () => {
    const models: AiPromptModel[] = [
      createModel('openai/gpt-5', 'GPT-5', 'openai', 'OpenAI', 'direct'),
      createModel('anthropic/claude', 'Claude', 'openrouter', 'OpenRouter: Anthropic', 'openrouter'),
      createModel('google/gemini', 'Gemini', 'openrouter', 'OpenRouter: Google', 'openrouter'),
    ];

    const providers = buildModelDropdownSections(models)[0].options;
    const direct = providers[0];
    const openRouter = providers[1];

    expect(direct.label).toBe('OpenAI (Direct)');
    expect(direct.submenu?.title).toBe('OpenAI (Direct)');
    expect(openRouter.submenu?.title).toBe('OpenRouter Models');
    expect(openRouter.submenu?.sections.map(section => section.title)).toEqual(['Anthropic', 'Google']);
    expect(openRouter.submenu?.sections[1].dividerBefore).toBe(true);
    expect(openRouter.submenu?.sections[0].options[0].searchTerms).toContain('Anthropic');
  });
});

function createHierarchy(): ActDto[] {
  return [
    createAct('act-1', 'Act One', [
      createChapter('chapter-1', 'Chapter One', [
        createScene('scene-1', 'Opening', 0),
        createScene('scene-2', 'Crossroads', 1),
      ]),
    ]),
    createAct('act-2', 'Act Two', [
      createChapter('chapter-2', 'Chapter Two', [createScene('scene-3', 'Ending', 0)]),
    ]),
  ];
}

function createAct(id: string, title: string, chapters: ChapterDto[]): ActDto {
  return { id, title, bookId: 'book-1', position: 0, status: 'active', summary: null, chapters };
}

function createChapter(id: string, title: string, scenes: SceneDto[]): ChapterDto {
  return { id, title, actId: 'act-1', position: 0, status: 'active', summary: null, scenes };
}

function createScene(id: string, title: string, position: number): SceneDto {
  return {
    id,
    title,
    chapterId: 'chapter-1',
    position,
    status: 'active',
    prose: null,
    summary: null,
    wordCount: 0,
    pointOfViewOverride: null,
    povCharacterIdOverride: null,
  };
}

function createCodexEntry(
  id: string,
  name: string,
  type: CodexEntryType,
  status: CodexEntryDto['status'] = 'active',
  alias: string | null = null,
): CodexEntryDto {
  return {
    id,
    bookId: 'book-1',
    type,
    name,
    alias,
    description: null,
    image: null,
    status,
    trackingSetting: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createModel(
  id: string,
  name: string,
  provider: string,
  providerName: string,
  source: AiPromptModel['source'],
): AiPromptModel {
  return { id, name, provider, providerName, source };
}
