import type { CodexEntryDto, CodexEntryType } from '../../../../../../shared/models/codex.model';
import type { ActDto, ChapterDto, SceneDto } from '../../../../../../shared/models/manuscript.model';
import type {
  DropdownMenu,
  DropdownOption,
  DropdownSection,
} from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';

export type AiManuscriptContextRef =
  | 'novel'
  | `act:${string}`
  | `chapter:${string}`
  | `scene:${string}`;

export interface AiContextSelection {
  includeFullOutline: boolean;
  manuscriptRefs: AiManuscriptContextRef[];
  codexEntryIds: string[];
}

export interface AiPromptModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  source: 'direct' | 'openrouter' | string;
}

export interface AiContextDropdownSource {
  hierarchy: readonly ActDto[];
  codexEntries: readonly CodexEntryDto[];
  automaticallyIncludedCodexEntryIds: ReadonlySet<string>;
  hierarchyLoading: boolean;
  codexLoading: boolean;
  hierarchyError: string | null;
  codexError: string | null;
}

interface CodexCategory {
  type: CodexEntryType;
  label: string;
}

const CODEX_CATEGORIES: readonly CodexCategory[] = [
  { type: 'character', label: 'Characters' },
  { type: 'location', label: 'Locations' },
  { type: 'object', label: 'Objects' },
  { type: 'lore', label: 'Lore' },
  { type: 'subplot', label: 'Subplots' },
  { type: 'other', label: 'Other' },
];

const DIRECT_PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI (Direct)',
  google: 'Google Gemini (Direct)',
};

export function buildContextDropdownSections(source: AiContextDropdownSource): DropdownSection<string>[] {
  const activeCodexEntries = [...source.codexEntries]
    .filter(entry => entry.status === 'active' && entry.trackingSetting !== 'never_include')
    .sort((a, b) => a.name.localeCompare(b.name));
  const allScenes = scenesForActs(source.hierarchy);
  const allManuscriptValues = manuscriptValuesForNovel(source.hierarchy);

  const outlineOptions: DropdownOption<string>[] = [{
    value: 'outline',
    label: 'Full Outline',
    hint: 'Titles & summaries',
  }];

  if (!source.hierarchyLoading && !source.hierarchyError) {
    outlineOptions.push({
      value: 'branch:novel',
      label: 'Novel',
      count: allScenes.length,
      disabled: allScenes.length === 0,
      selectionValues: allManuscriptValues,
      submenu: buildNovelMenu(source.hierarchy),
    });
  }

  const codexOptions = source.codexLoading || source.codexError
    ? []
    : CODEX_CATEGORIES.map(category => buildCodexCategoryOption(
      category,
      activeCodexEntries,
      source.automaticallyIncludedCodexEntryIds,
    ));

  return [
    {
      key: 'outline-novel',
      title: 'Outline & Novel',
      options: outlineOptions,
      message: source.hierarchyLoading
        ? { text: 'Loading novel structure...' }
        : source.hierarchyError
          ? { text: source.hierarchyError, tone: 'error' }
          : undefined,
    },
    {
      key: 'codex',
      title: 'Codex',
      dividerBefore: true,
      options: codexOptions,
      message: source.codexLoading
        ? { text: 'Loading Codex entries...' }
        : source.codexError
          ? { text: source.codexError, tone: 'error' }
          : undefined,
    },
  ];
}

export function contextSelectionToValues(
  selection: AiContextSelection,
  hierarchy: readonly ActDto[],
): string[] {
  const values = new Set<string>();

  if (selection.includeFullOutline) values.add('outline');

  const refs = new Set<AiManuscriptContextRef>(selection.manuscriptRefs);
  if (refs.has('novel')) {
    manuscriptValuesForNovel(hierarchy).forEach(value => values.add(value));
  } else {
    for (const act of hierarchy) {
      if (refs.has(actValue(act.id))) {
        manuscriptValuesForAct(act).forEach(value => values.add(value));
        continue;
      }

      for (const chapter of act.chapters ?? []) {
        if (refs.has(chapterValue(chapter.id))) {
          manuscriptValuesForChapter(chapter).forEach(value => values.add(value));
          continue;
        }

        for (const scene of chapter.scenes ?? []) {
          if (refs.has(sceneValue(scene.id))) values.add(sceneValue(scene.id));
        }
      }
    }
  }

  selection.codexEntryIds.forEach(id => values.add(codexValue(id)));
  return [...values];
}

export function dropdownValuesToContextSelection(
  values: readonly string[],
  hierarchy: readonly ActDto[],
): AiContextSelection {
  const selected = new Set(values);
  const manuscriptRefs: AiManuscriptContextRef[] = [];

  const novelValues = manuscriptValuesForNovel(hierarchy);
  if (novelValues.length > 1 && novelValues.every(value => selected.has(value))) {
    manuscriptRefs.push('novel');
  } else {
    for (const act of hierarchy) {
      const actValues = manuscriptValuesForAct(act);
      if (actValues.length > 1 && actValues.every(value => selected.has(value))) {
        manuscriptRefs.push(actValue(act.id));
        continue;
      }

      for (const chapter of act.chapters ?? []) {
        const chapterValues = manuscriptValuesForChapter(chapter);
        if (chapterValues.length > 1 && chapterValues.every(value => selected.has(value))) {
          manuscriptRefs.push(chapterValue(chapter.id));
          continue;
        }

        for (const scene of chapter.scenes ?? []) {
          const value = sceneValue(scene.id);
          if (selected.has(value)) manuscriptRefs.push(value);
        }
      }
    }
  }

  return {
    includeFullOutline: selected.has('outline'),
    manuscriptRefs,
    codexEntryIds: [...selected]
      .filter(value => value.startsWith('codex:'))
      .map(value => value.slice(6)),
  };
}

export function restoreManuscriptContextRefs(
  manuscriptRefs: unknown,
  legacySceneIds: unknown,
): AiManuscriptContextRef[] {
  if (manuscriptRefs === null || manuscriptRefs === undefined) {
    return uniqueStrings(legacySceneIds).map(id => sceneValue(id));
  }

  return uniqueStrings(manuscriptRefs).filter(isManuscriptContextRef);
}

function buildNovelMenu(hierarchy: readonly ActDto[]): DropdownMenu<string> {
  return {
    sections: [{
      key: 'acts',
      options: hierarchy.map(act => {
        const scenes = scenesForAct(act);
        const values = manuscriptValuesForAct(act);
        return {
          value: `branch:act:${act.id}`,
          label: act.title || 'Untitled Act',
          disabled: scenes.length === 0,
          selectionValues: values,
          submenu: buildActMenu(act),
        };
      }),
    }],
  };
}

function buildActMenu(act: ActDto): DropdownMenu<string> {
  return {
    sections: [{
      key: `chapters:${act.id}`,
      options: (act.chapters ?? []).map(chapter => {
        const scenes = scenesForChapter(chapter);
        const values = manuscriptValuesForChapter(chapter);
        return {
          value: `branch:chapter:${chapter.id}`,
          label: chapter.title || 'Untitled Chapter',
          disabled: scenes.length === 0,
          selectionValues: values,
          submenu: buildChapterMenu(chapter),
        };
      }),
    }],
  };
}

function buildChapterMenu(chapter: ChapterDto): DropdownMenu<string> {
  return {
    sections: [{
      key: `scenes:${chapter.id}`,
      options: scenesForChapter(chapter).map(scene => ({
        value: sceneValue(scene.id),
        label: scene.title || 'Untitled Scene',
      })),
    }],
  };
}

function buildCodexCategoryOption(
  category: CodexCategory,
  activeEntries: readonly CodexEntryDto[],
  automaticallyIncludedEntryIds: ReadonlySet<string>,
): DropdownOption<string> {
  const entries = activeEntries.filter(entry => entry.type === category.type);
  const selectableEntries = entries.filter(entry => !automaticallyIncludedEntryIds.has(entry.id));
  const values = selectableEntries.map(entry => codexValue(entry.id));
  return {
    value: `branch:codex:${category.type}`,
    label: category.label,
    count: entries.length,
    disabled: entries.length === 0,
    selectable: entries.length > 0 && selectableEntries.length === 0 ? false : undefined,
    selectionValues: values,
    submenu: {
      sections: [{
        key: `codex-entries:${category.type}`,
        options: entries.map(entry => {
          const automaticallyIncluded = automaticallyIncludedEntryIds.has(entry.id);
          return {
            value: codexValue(entry.id),
            label: entry.name,
            searchTerms: entry.alias ? [entry.alias] : undefined,
            disabled: automaticallyIncluded,
            hint: automaticallyIncluded
              ? entry.trackingSetting === 'always_include' ? 'Always included' : 'Detected in context'
              : undefined,
          };
        }),
      }],
    },
  };
}

export function buildModelDropdownSections(models: readonly AiPromptModel[]): DropdownSection<string>[] {
  const directProviders = new Map<string, AiPromptModel[]>();
  const openRouterModels: AiPromptModel[] = [];

  for (const model of models) {
    if (model.source === 'direct') {
      const providerModels = directProviders.get(model.provider) ?? [];
      providerModels.push(model);
      directProviders.set(model.provider, providerModels);
    } else if (model.source === 'openrouter') {
      openRouterModels.push(model);
    }
  }

  const providerOptions: DropdownOption<string>[] = [...directProviders.entries()]
    .map(([providerId, providerModels]) => {
      const title = directProviderDisplayName(providerId);
      return {
        value: `provider:${providerId}`,
        label: title,
        selectable: false,
        submenu: {
          title,
          sections: [{
            key: `models:${providerId}`,
            options: providerModels.map(model => modelOption(model, [title])),
          }],
        },
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  if (openRouterModels.length > 0) {
    const groups = new Map<string, AiPromptModel[]>();
    for (const model of openRouterModels) {
      const providerName = model.providerName.replace(/^OpenRouter:\s*/, '');
      const providerModels = groups.get(providerName) ?? [];
      providerModels.push(model);
      groups.set(providerName, providerModels);
    }

    providerOptions.push({
      value: 'provider:openrouter',
      label: 'OpenRouter',
      selectable: false,
      submenu: {
        title: 'OpenRouter Models',
        sections: [...groups.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([providerName, providerModels], index) => ({
            key: `openrouter:${providerName}`,
            title: providerName,
            dividerBefore: index > 0,
            options: providerModels.map(model => modelOption(model, ['OpenRouter', providerName])),
          })),
      },
    });
  }

  return [{ key: 'model-providers', options: providerOptions }];
}

function modelOption(model: AiPromptModel, searchTerms: readonly string[]): DropdownOption<string> {
  return {
    value: model.id,
    label: model.name,
    searchTerms: [...new Set([model.providerName, ...searchTerms])],
  };
}

function directProviderDisplayName(providerId: string): string {
  return DIRECT_PROVIDER_NAMES[providerId] ?? providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

function sceneValue(id: string): `scene:${string}` {
  return `scene:${id}`;
}

function actValue(id: string): `act:${string}` {
  return `act:${id}`;
}

function chapterValue(id: string): `chapter:${string}` {
  return `chapter:${id}`;
}

function codexValue(id: string): string {
  return `codex:${id}`;
}

function scenesForActs(acts: readonly ActDto[]): SceneDto[] {
  return acts.flatMap(scenesForAct);
}

function scenesForAct(act: ActDto): SceneDto[] {
  return (act.chapters ?? []).flatMap(scenesForChapter);
}

function scenesForChapter(chapter: ChapterDto): SceneDto[] {
  return [...(chapter.scenes ?? [])];
}

function manuscriptValuesForNovel(hierarchy: readonly ActDto[]): string[] {
  return ['novel', ...hierarchy.flatMap(manuscriptValuesForAct)];
}

function manuscriptValuesForAct(act: ActDto): string[] {
  return [actValue(act.id), ...(act.chapters ?? []).flatMap(manuscriptValuesForChapter)];
}

function manuscriptValuesForChapter(chapter: ChapterDto): string[] {
  return [chapterValue(chapter.id), ...scenesForChapter(chapter).map(scene => sceneValue(scene.id))];
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))];
}

function isManuscriptContextRef(value: string): value is AiManuscriptContextRef {
  return value === 'novel'
    || value.startsWith('act:')
    || value.startsWith('chapter:')
    || value.startsWith('scene:');
}
