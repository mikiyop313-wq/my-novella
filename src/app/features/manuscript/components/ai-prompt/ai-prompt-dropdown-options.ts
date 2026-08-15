import type { CodexEntryDto, CodexEntryType } from '../../../../../../shared/models/codex.model';
import type { ActDto, ChapterDto, SceneDto } from '../../../../../../shared/models/manuscript.model';
import type { AiModel, AiModelProviderGroup } from '../../../../../../shared/models/ai.model';
import type { AiManuscriptContextRef } from '../../../../shared/models/ai-context.model';
import { filterHierarchyForContext } from '../../../../../../shared/utils/manuscript-context-inclusion';
import type {
  DropdownMenu,
  DropdownOption,
  DropdownSection,
} from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';

export type { AiManuscriptContextRef } from '../../../../shared/models/ai-context.model';

export interface AiContextSelection {
  includeBookMetadata: boolean;
  includeFullOutline: boolean;
  manuscriptRefs: AiManuscriptContextRef[];
  codexEntryIds: string[];
}

export type AiPromptModel = AiModel;

export interface AiModelDropdownSource {
  providers: readonly AiModelProviderGroup[];
  loading: boolean;
  error: string | null;
}

export interface AiContextDropdownSource {
  hierarchy: readonly ActDto[];
  codexEntries: readonly CodexEntryDto[];
  automaticallyIncludedCodexEntryIds: ReadonlySet<string>;
  hierarchyLoading: boolean;
  codexLoading: boolean;
  hierarchyError: string | null;
  codexError: string | null;
  bookMetadata?: {
    availableFields: readonly string[];
    loading: boolean;
    error: string | null;
  };
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

export function buildContextDropdownSections(source: AiContextDropdownSource): DropdownSection<string>[] {
  const hierarchy = filterHierarchyForContext(source.hierarchy);
  const activeCodexEntries = [...source.codexEntries]
    .filter(entry => entry.status === 'active' && entry.trackingSetting !== 'never_include')
    .sort((a, b) => a.name.localeCompare(b.name));
  const allScenes = scenesForActs(hierarchy);
  const allManuscriptValues = manuscriptValuesForNovel(hierarchy);

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
      submenu: buildNovelMenu(hierarchy),
    });
  }

  const codexOptions = source.codexLoading || source.codexError
    ? []
    : CODEX_CATEGORIES.map(category => buildCodexCategoryOption(
      category,
      activeCodexEntries,
      source.automaticallyIncludedCodexEntryIds,
    ));

  const sections: DropdownSection<string>[] = [];

  if (source.bookMetadata) {
    const { availableFields, loading, error } = source.bookMetadata;
    const metadataAvailable = availableFields.length > 0;
    sections.push({
      key: 'book-metadata',
      title: 'Book Metadata',
      options: [{
        value: 'book-metadata',
        label: 'Book Metadata',
        hint: metadataAvailable ? availableFields.join(', ') : 'No metadata available',
        disabled: loading || !!error || !metadataAvailable,
      }],
      message: loading
        ? { text: 'Loading book metadata...' }
        : error
          ? { text: error, tone: 'error' }
          : undefined,
    });
  }

  sections.push(
    {
      key: 'outline-novel',
      title: 'Outline & Novel',
      dividerBefore: source.bookMetadata !== undefined,
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
  );

  return sections;
}

export function contextSelectionToValues(
  selection: AiContextSelection,
  hierarchy: readonly ActDto[],
): string[] {
  const selectableHierarchy = filterHierarchyForContext(hierarchy);
  const values = new Set<string>();

  if (selection.includeBookMetadata) values.add('book-metadata');
  if (selection.includeFullOutline) values.add('outline');

  const refs = new Set<AiManuscriptContextRef>(selection.manuscriptRefs);
  if (refs.has('novel')) {
    manuscriptValuesForNovel(selectableHierarchy).forEach(value => values.add(value));
  } else {
    for (const act of selectableHierarchy) {
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
  const selectableHierarchy = filterHierarchyForContext(hierarchy);
  const selected = new Set(values);
  const manuscriptRefs: AiManuscriptContextRef[] = [];

  const novelValues = manuscriptValuesForNovel(selectableHierarchy);
  if (novelValues.length > 0 && novelValues.every(value => selected.has(value))) {
    manuscriptRefs.push('novel');
  } else {
    for (const act of selectableHierarchy) {
      const actValues = manuscriptValuesForAct(act);
      if (actValues.length > 0 && actValues.every(value => selected.has(value))) {
        manuscriptRefs.push(actValue(act.id));
        continue;
      }

      for (const chapter of act.chapters ?? []) {
        const chapterValues = manuscriptValuesForChapter(chapter);
        if (chapterValues.length > 0 && chapterValues.every(value => selected.has(value))) {
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
    includeBookMetadata: selected.has('book-metadata'),
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

export function filterSelectableManuscriptRefs(
  hierarchy: readonly ActDto[],
  refs: readonly AiManuscriptContextRef[],
): AiManuscriptContextRef[] {
  const selectableHierarchy = filterHierarchyForContext(hierarchy);
  const validRefs = new Set<AiManuscriptContextRef>();
  if (scenesForActs(selectableHierarchy).length > 0) validRefs.add('novel');

  for (const act of selectableHierarchy) {
    validRefs.add(actValue(act.id));
    for (const chapter of act.chapters ?? []) {
      validRefs.add(chapterValue(chapter.id));
      for (const scene of chapter.scenes ?? []) validRefs.add(sceneValue(scene.id));
    }
  }

  return [...new Set(refs)].filter((ref) => validRefs.has(ref));
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

export function buildModelDropdownSections(
  source: AiModelDropdownSource,
): DropdownSection<string>[] {
  const providerOptions = source.providers.map((provider): DropdownOption<string> => {
    if (provider.state !== 'ready') {
      return unavailableProviderOption(
        provider,
        provider.state === 'unconfigured' ? 'Not configured' : 'Models unavailable',
      );
    }

    if (provider.models.length === 0) {
      return unavailableProviderOption(provider, 'No models available');
    }

    if (provider.id !== 'openrouter') {
      return {
        value: `provider:${provider.id}`,
        label: provider.name,
        selectable: false,
        submenu: {
          title: provider.name,
          sections: [{
            key: `models:${provider.id}`,
            options: provider.models.map((model) => modelOption(model, [provider.name])),
          }],
        },
      };
    }

    const groups = new Map<string, AiPromptModel[]>();
    for (const model of provider.models) {
      const providerName = (model.providerName || model.provider || 'Other')
        .replace(/^OpenRouter:\s*/, '');
      const providerModels = groups.get(providerName) ?? [];
      providerModels.push(model);
      groups.set(providerName, providerModels);
    }

    return {
      value: 'provider:openrouter',
      label: provider.name,
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
    };
  });

  const isLocalProvider = (option: DropdownOption<string>): boolean => (
    option.value === 'provider:ollama' || option.value === 'provider:lm-studio'
  );
  const cloudProviders = providerOptions.filter((option) => !isLocalProvider(option));
  const localProviders = providerOptions.filter(isLocalProvider);

  return [
    {
      key: 'cloud-model-providers',
      title: 'Cloud providers',
      options: cloudProviders,
      message: source.loading
        ? { text: 'Loading models...' }
        : source.error
          ? { text: 'Unable to load model providers.', tone: 'error' }
          : undefined,
    },
    {
      key: 'local-model-providers',
      title: 'Local providers',
      dividerBefore: true,
      options: localProviders,
    },
  ];
}

function modelOption(model: AiPromptModel, searchTerms: readonly string[]): DropdownOption<string> {
  return {
    value: model.id,
    label: model.name || model.id,
    searchTerms: [...new Set([model.providerName, ...searchTerms].filter(
      (term): term is string => !!term,
    ))],
  };
}

function unavailableProviderOption(
  provider: AiModelProviderGroup,
  hint: string,
): DropdownOption<string> {
  return {
    value: `provider:${provider.id}`,
    label: provider.name,
    hint,
    disabled: true,
    selectable: false,
  };
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
  return hierarchy.flatMap(manuscriptValuesForAct);
}

function manuscriptValuesForAct(act: ActDto): string[] {
  return (act.chapters ?? []).flatMap(manuscriptValuesForChapter);
}

function manuscriptValuesForChapter(chapter: ChapterDto): string[] {
  return scenesForChapter(chapter).map(scene => sceneValue(scene.id));
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
