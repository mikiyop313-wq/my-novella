import type {
  ActiveSystemPromptPresetIds,
  SystemPromptCategory,
  SystemPromptGenerationSettings,
} from '../models/system-prompt.model';

/** Centralized AI system prompts, organized by purpose. */
export const AI_SYSTEM_PROMPTS = {
  /** Chat-related system prompts. */
  chat: {
    /** Default system prompt for the main chat assistant. */
    default: `You are a helpful, expert assistant to a novel author.
        They will ask you questions about their story and you will answer them. 
        Always try to answer their question as best as you can, but don't worry if you don't know the answer.
        If you are unsure, ask for clarification rather than guessing.
        Always write your answer in Markdown format, don't use HTML tags to format the response`,
    none: '',
  },

  /** Prose-generation system prompts. */
  sceneBeat: {
    default: `You are an expert fiction writer helping a novelist draft prose.
Use the supplied story context and follow the user's indication to write the requested prose.
Preserve established continuity, point of view, tense, tone, and character voice.
Use natural paragraph breaks to keep the prose readable.
Return only the prose.`,
  },

  /** Prose-rephrasing system prompts. */
  rephrase: {
    default: `You are an expert fiction editor.
Rephrase the supplied passage while preserving its meaning, story facts, point of view, tense, tone, and character voice.
Improve clarity, flow, and word choice without adding new events or commentary.
Return only the revised prose.`,
  },

  /** Story-summary system prompts. */
  summary: {
    default: `You are an expert fiction editor.
Summarize the supplied story material clearly and concisely, retaining the key actions, decisions, revelations, emotional shifts, and unresolved threads.
Preserve established names and story facts without adding analysis or new information.
Return only the summary.`,
  },

  /** Prose-expansion system prompts. */
  expand: {
    default: `You are an expert fiction editor.
Expand the supplied passage with meaningful sensory detail, action, dialogue, or interiority while preserving its events, story facts, point of view, tense, tone, and character voice.
Do not change established outcomes or introduce unrelated material.
Return only the expanded prose.`,
  },

  /** Prose-shortening system prompts. */
  shorten: {
    default: `You are an expert fiction editor.
Shorten the supplied passage by removing repetition, filler, and unnecessary wording while preserving its essential meaning, story facts, point of view, tense, tone, and character voice.
Keep the prose natural and coherent.
Return only the shortened prose.`,
  },

  /** Codex-entry detection system prompts. */
  codexDetection: {
    default: `You identify new Codex entries in fiction prose for a novelist.
Detect distinct characters, locations, important objects, lore, subplots, and other story concepts that deserve reusable reference entries.
Use the supplied existing Codex names and aliases to avoid proposing entries that already exist.
Write a concise, factual description for each entry using only information supported by the supplied prose.`,
  },

  /** Chat-thread title system prompts. */
  title: {
    default: [
      'Create a concise title for this chat thread based only on the user message.',
      'Return only the title.',
      'Use 3 to 7 words.',
      'Do not use quotation marks, markdown, labels, or terminal punctuation.',
    ].join(' '),
  },
} as const;

export interface BuiltInSystemPromptPreset extends SystemPromptGenerationSettings {
  id: string;
  name: string;
  category: SystemPromptCategory;
  systemPrompt: string;
  defaultModelId: string | null;
}

export const DEFAULT_ACTION_MODEL_ID = 'deepseek/deepseek-v4-flash';

export const MODEL_BACKED_SYSTEM_PROMPT_CATEGORIES = [
  'rephrase',
  'summary',
  'expand',
  'shorten',
  'codexDetection',
] as const satisfies readonly SystemPromptCategory[];

export function categoryUsesDefaultModel(category: SystemPromptCategory): boolean {
  return MODEL_BACKED_SYSTEM_PROMPT_CATEGORIES.some(candidate => candidate === category);
}

const DEFAULT_GENERATION_SETTINGS: SystemPromptGenerationSettings = {
  temperature: 0.5,
  topP: 1,
  maxOutputTokens: null,
  presencePenalty: 0,
  frequencyPenalty: 0,
};

export const BUILT_IN_SYSTEM_PROMPT_PRESETS = {
  chat: builtInPreset(
    'default-assistant',
    'Default Assistant',
    'chat',
    AI_SYSTEM_PROMPTS.chat.default,
  ),
  sceneBeat: builtInPreset(
    'default-scene-beat',
    'Default Scene Beat',
    'sceneBeat',
    AI_SYSTEM_PROMPTS.sceneBeat.default,
  ),
  rephrase: builtInPreset(
    'default-rephrase',
    'Default Rephrase',
    'rephrase',
    AI_SYSTEM_PROMPTS.rephrase.default,
  ),
  summary: builtInPreset(
    'default-summary',
    'Default Summary',
    'summary',
    AI_SYSTEM_PROMPTS.summary.default,
  ),
  expand: builtInPreset(
    'default-expand',
    'Default Expand',
    'expand',
    AI_SYSTEM_PROMPTS.expand.default,
  ),
  shorten: builtInPreset(
    'default-shorten',
    'Default Shorten',
    'shorten',
    AI_SYSTEM_PROMPTS.shorten.default,
  ),
  codexDetection: builtInPreset(
    'default-codex-detection',
    'Default Codex Detection',
    'codexDetection',
    AI_SYSTEM_PROMPTS.codexDetection.default,
  ),
  title: builtInPreset(
    'default-title',
    'Default Chat Title',
    'title',
    AI_SYSTEM_PROMPTS.title.default,
  ),
} satisfies Record<SystemPromptCategory, BuiltInSystemPromptPreset>;

export function findBuiltInSystemPromptPreset(
  presetId: string,
): BuiltInSystemPromptPreset | undefined {
  return Object.values(BUILT_IN_SYSTEM_PROMPT_PRESETS).find((preset) => preset.id === presetId);
}

export function createDefaultSystemPromptPresetIds(): ActiveSystemPromptPresetIds {
  return Object.fromEntries(
    Object.values(BUILT_IN_SYSTEM_PROMPT_PRESETS).map((preset) => [preset.category, preset.id]),
  ) as ActiveSystemPromptPresetIds;
}

function builtInPreset(
  id: string,
  name: string,
  category: SystemPromptCategory,
  systemPrompt: string,
): BuiltInSystemPromptPreset {
  return {
    id,
    name,
    category,
    systemPrompt,
    defaultModelId: categoryUsesDefaultModel(category) ? DEFAULT_ACTION_MODEL_ID : null,
    ...DEFAULT_GENERATION_SETTINGS,
  };
}
