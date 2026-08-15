import type { CodexEntryDto, CodexEntryType } from '../../../../../../shared/models/codex.model';
import type { ActDto, ChapterDto, SceneDto } from '../../../../../../shared/models/manuscript.model';
import type {
  DropdownMenu,
  DropdownOption,
  DropdownSection,
} from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';

export interface AiContextSelection {
  includeFullOutline: boolean;
  sceneIds: string[];
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
    .filter(entry => entry.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name));
  const allScenes = scenesForActs(source.hierarchy);
  const allSceneValues = allScenes.map(scene => sceneValue(scene.id));

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
      selectionValues: allSceneValues,
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

export function contextSelectionToValues(selection: AiContextSelection): string[] {
  return [
    ...(selection.includeFullOutline ? ['outline'] : []),
    ...selection.sceneIds.map(sceneValue),
    ...selection.codexEntryIds.map(codexValue),
  ];
}

export function dropdownValuesToContextSelection(values: readonly string[]): AiContextSelection {
  const uniqueValues = [...new Set(values)];
  return {
    includeFullOutline: uniqueValues.includes('outline'),
    sceneIds: uniqueValues.filter(value => value.startsWith('scene:')).map(value => value.slice(6)),
    codexEntryIds: uniqueValues.filter(value => value.startsWith('codex:')).map(value => value.slice(6)),
  };
}

function buildNovelMenu(hierarchy: readonly ActDto[]): DropdownMenu<string> {
  return {
    sections: [{
      key: 'acts',
      options: hierarchy.map(act => {
        const scenes = scenesForAct(act);
        const values = scenes.map(scene => sceneValue(scene.id));
        return {
          value: `branch:act:${act.id}`,
          label: act.title || 'Untitled Act',
          disabled: values.length === 0,
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
        const values = scenes.map(scene => sceneValue(scene.id));
        return {
          value: `branch:chapter:${chapter.id}`,
          label: chapter.title || 'Untitled Chapter',
          disabled: values.length === 0,
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
              ? entry.trackingSetting === 'always_include' ? 'Always included' : 'Detected above'
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

function sceneValue(id: string): string {
  return `scene:${id}`;
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
