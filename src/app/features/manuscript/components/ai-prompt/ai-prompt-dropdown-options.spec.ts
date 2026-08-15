import type { CodexEntryDto, CodexEntryType } from '../../../../../../shared/models/codex.model';
import type { AiModelProviderGroup } from '../../../../../../shared/models/ai.model';
import type { ActDto, ChapterDto, SceneDto } from '../../../../../../shared/models/manuscript.model';

import {
  type AiPromptModel,
  buildContextDropdownSections,
  buildModelDropdownSections,
  contextSelectionToValues,
  dropdownValuesToContextSelection,
  filterSelectableManuscriptRefs,
  restoreManuscriptContextRefs,
} from './ai-prompt-dropdown-options';

describe('AI prompt dropdown options', () => {
  it('maps the manuscript hierarchy into aggregate recursive context options', () => {
    const sections = buildContextDropdownSections({
      hierarchy: createHierarchy(),
      codexEntries: [],
      automaticallyIncludedCodexEntryIds: new Set(),
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
    expect(novel.selectionValues).toEqual([
      'scene:scene-1',
      'scene:scene-2',
      'scene:scene-3',
    ]);
    expect(act.selectionValues).toEqual([
      'scene:scene-1',
      'scene:scene-2',
    ]);
    expect(chapter.submenu!.sections[0].options.map(option => option.label)).toEqual(['Opening', 'Crossroads']);
  });

  it('removes excluded branches and prunes stale manuscript selections', () => {
    const hierarchy = createHierarchy();
    hierarchy[0].chapters![0].scenes![1].includeInContext = false;
    hierarchy[1].chapters![0].scenes![0].includeInContext = false;

    const sections = buildContextDropdownSections({
      hierarchy,
      codexEntries: [],
      automaticallyIncludedCodexEntryIds: new Set(),
      hierarchyLoading: false,
      codexLoading: false,
      hierarchyError: null,
      codexError: null,
    });
    const novel = sections[0].options[1];

    expect(novel.count).toBe(1);
    expect(novel.selectionValues).toEqual(['scene:scene-1']);
    expect(novel.submenu?.sections[0].options.map((option) => option.label)).toEqual(['Act One']);
    expect(contextSelectionToValues({
      includeFullOutline: false,
      manuscriptRefs: ['scene:scene-2', 'act:act-2'],
      codexEntryIds: [],
    }, hierarchy)).toEqual([]);
    expect(filterSelectableManuscriptRefs(
      hierarchy,
      ['act:act-1', 'scene:scene-2', 'act:act-2'],
    )).toEqual(['act:act-1']);
  });

  it('filters and sorts active Codex entries while retaining aliases for search', () => {
    const sections = buildContextDropdownSections({
      hierarchy: [],
      codexEntries: [
        createCodexEntry('char-2', 'Zara', 'character'),
        createCodexEntry('char-1', 'Ari', 'character', 'active', 'The Protagonist'),
        createCodexEntry('archived', 'Old Hero', 'character', 'archived'),
        createCodexEntry('never', 'Secret Hero', 'character', 'active', null, 'never_include'),
      ],
      automaticallyIncludedCodexEntryIds: new Set(),
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

  it('disables automatically included Codex entries and excludes them from category selection', () => {
    const sections = buildContextDropdownSections({
      hierarchy: [],
      codexEntries: [
        createCodexEntry('always', 'Ari', 'character', 'active', null, 'always_include'),
        createCodexEntry('detected', 'Mara', 'character', 'active', null, 'include_when_detected'),
        createCodexEntry('manual', 'Zara', 'character', 'active', null, 'manual'),
        createCodexEntry('location', 'Citadel', 'location', 'active', null, 'always_include'),
      ],
      automaticallyIncludedCodexEntryIds: new Set(['always', 'detected', 'location']),
      hierarchyLoading: false,
      codexLoading: false,
      hierarchyError: null,
      codexError: null,
    });

    const characters = sections[1].options[0];
    const characterEntries = characters.submenu!.sections[0].options;
    const locations = sections[1].options[1];

    expect(characters.selectionValues).toEqual(['codex:manual']);
    expect(characterEntries.map(entry => ({
      value: entry.value,
      disabled: entry.disabled,
      hint: entry.hint,
    }))).toEqual([
      { value: 'codex:always', disabled: true, hint: 'Always included' },
      { value: 'codex:detected', disabled: true, hint: 'Detected in context' },
      { value: 'codex:manual', disabled: false, hint: undefined },
    ]);
    expect(locations.disabled).toBe(false);
    expect(locations.selectable).toBe(false);
    expect(locations.selectionValues).toEqual([]);
    expect(locations.submenu!.sections[0].options[0].hint).toBe('Always included');
  });

  it('round-trips persisted context state and ignores branch identifiers', () => {
    const values = contextSelectionToValues({
      includeFullOutline: true,
      manuscriptRefs: ['scene:scene-1'],
      codexEntryIds: ['entry-1'],
    }, createHierarchy());

    expect(values).toEqual(['outline', 'scene:scene-1', 'codex:entry-1']);
    expect(dropdownValuesToContextSelection(
      [...values, 'branch:novel', 'scene:scene-1'],
      createHierarchy(),
    )).toEqual({
      includeFullOutline: true,
      manuscriptRefs: ['scene:scene-1'],
      codexEntryIds: ['entry-1'],
    });
  });

  it('promotes fully selected scenes to their highest complete manuscript branch', () => {
    const hierarchy = createHierarchy();
    const chapterValues = ['scene:scene-1', 'scene:scene-2'];
    const hierarchyWithIncompleteSiblingChapter = [
      {
        ...hierarchy[0],
        chapters: [
          ...hierarchy[0].chapters!,
          createChapter('chapter-extra', 'Extra Chapter', [createScene('scene-extra', 'Extra Scene', 0)]),
        ],
      },
      hierarchy[1],
    ];

    expect(dropdownValuesToContextSelection(
      chapterValues,
      hierarchyWithIncompleteSiblingChapter,
    ).manuscriptRefs)
      .toEqual(['chapter:chapter-1']);
    expect(dropdownValuesToContextSelection(chapterValues, hierarchy).manuscriptRefs)
      .toEqual(['act:act-1']);
    expect(dropdownValuesToContextSelection(
      [...chapterValues, 'scene:scene-3'],
      hierarchy,
    ).manuscriptRefs).toEqual(['novel']);
  });

  it('invalidates incomplete ancestors while preserving complete sibling aggregates', () => {
    const hierarchy = createHierarchy();
    const selectedNovel = contextSelectionToValues({
      includeFullOutline: false,
      manuscriptRefs: ['novel'],
      codexEntryIds: [],
    }, hierarchy);

    const result = dropdownValuesToContextSelection(
      selectedNovel.filter(value => value !== 'scene:scene-1'),
      hierarchy,
    );

    expect(result.manuscriptRefs).toEqual(['scene:scene-2', 'act:act-2']);
  });

  it('restores legacy scene IDs only when the new attribute is absent', () => {
    expect(restoreManuscriptContextRefs(null, ['scene-1', 'scene-1'])).toEqual(['scene:scene-1']);
    expect(restoreManuscriptContextRefs([], ['scene-1'])).toEqual([]);
    expect(restoreManuscriptContextRefs(['chapter:chapter-1'], ['scene-1']))
      .toEqual(['chapter:chapter-1']);
  });

  it('exposes loading and error messages without stale selectable branches', () => {
    const sections = buildContextDropdownSections({
      hierarchy: createHierarchy(),
      codexEntries: [createCodexEntry('char-1', 'Ari', 'character')],
      automaticallyIncludedCodexEntryIds: new Set(),
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
    const modelProviders: AiModelProviderGroup[] = [
      {
        id: 'openrouter',
        name: 'OpenRouter',
        state: 'ready',
        models: [
          createModel('anthropic/claude', 'Claude', 'anthropic', 'OpenRouter: Anthropic', 'openrouter'),
          createModel('google/gemini', 'Gemini', 'google', 'OpenRouter: Google', 'openrouter'),
        ],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        state: 'ready',
        models: [createModel('openai/gpt-5', 'GPT-5', 'openai', 'OpenAI', 'direct')],
      },
    ];

    const providers = buildModelDropdownSections({
      providers: modelProviders,
      loading: false,
      error: null,
    })[0].options;
    const openRouter = providers[0];
    const direct = providers[1];

    expect(direct.label).toBe('OpenAI');
    expect(direct.submenu?.title).toBe('OpenAI');
    expect(openRouter.submenu?.title).toBe('OpenRouter Models');
    expect(openRouter.submenu?.sections.map(section => section.title)).toEqual(['Anthropic', 'Google']);
    expect(openRouter.submenu?.sections[1].dividerBefore).toBe(true);
    expect(openRouter.submenu?.sections[0].options[0].searchTerms).toContain('Anthropic');
  });

  it('keeps unavailable and empty providers visible but disabled', () => {
    const sections = buildModelDropdownSections({
      providers: [
        { id: 'google', name: 'Google Gemini', state: 'unconfigured', models: [] },
        { id: 'anthropic', name: 'Anthropic', state: 'error', models: [] },
        { id: 'ollama', name: 'Ollama', state: 'ready', models: [] },
        {
          id: 'lm-studio',
          name: 'LM Studio',
          state: 'ready',
          models: [createModel('lm-studio/team/model', 'team/model', 'lm-studio', 'LM Studio', 'local')],
        },
      ],
      loading: false,
      error: null,
    });
    const cloudProviders = sections[0].options;
    const localProviders = sections[1].options;

    expect(sections.map((section) => section.title)).toEqual([
      'Cloud providers',
      'Local providers',
    ]);
    expect(sections[1].dividerBefore).toBe(true);
    expect(cloudProviders.map((provider) => ({
      label: provider.label,
      hint: provider.hint,
      disabled: provider.disabled,
    }))).toEqual([
      { label: 'Google Gemini', hint: 'Not configured', disabled: true },
      { label: 'Anthropic', hint: 'Models unavailable', disabled: true },
    ]);
    expect(localProviders.map((provider) => ({
      label: provider.label,
      hint: provider.hint,
      disabled: provider.disabled,
    }))).toEqual([
      { label: 'Ollama', hint: 'No models available', disabled: true },
      { label: 'LM Studio', hint: undefined, disabled: undefined },
    ]);
    expect(localProviders[1].submenu?.sections[0].options[0].value).toBe('lm-studio/team/model');
  });

  it('shows loading and global model-list errors as section messages', () => {
    expect(buildModelDropdownSections({ providers: [], loading: true, error: null })[0].message)
      .toEqual({ text: 'Loading models...' });
    expect(buildModelDropdownSections({ providers: [], loading: false, error: 'IPC failed' })[0].message)
      .toEqual({ text: 'Unable to load model providers.', tone: 'error' });
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
    wordCount: 1,
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
  trackingSetting: CodexEntryDto['trackingSetting'] = 'manual',
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
    trackingSetting,
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
