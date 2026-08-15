export type SystemPromptCategory =
  | 'chat'
  | 'sceneBeat'
  | 'rephrase'
  | 'summary'
  | 'expand'
  | 'shorten'
  | 'title';

export type SystemPromptScope = 'global' | 'book';

export type SystemPromptOwnership = { scope: 'global' } | { scope: 'book'; bookId: string };

export interface SystemPromptGenerationSettings {
  temperature: number;
  topP: number;
  maxOutputTokens: number | null;
  presencePenalty: number;
  frequencyPenalty: number;
}

export interface SystemPromptPresetDto extends SystemPromptGenerationSettings {
  id: string;
  name: string;
  systemPrompt: string;
  category: SystemPromptCategory;
  scope: SystemPromptScope;
  bookId: string | null;
  createdAt: string;
  lastEditedAt: string;
}

interface CreateSystemPromptPresetFields extends SystemPromptGenerationSettings {
  name: string;
  systemPrompt: string;
  category: SystemPromptCategory;
}

export type CreateSystemPromptPresetDto = CreateSystemPromptPresetFields & SystemPromptOwnership;

export interface UpdateSystemPromptPresetDto {
  name?: string;
  systemPrompt?: string;
  category?: SystemPromptCategory;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number | null;
  presencePenalty?: number;
  frequencyPenalty?: number;
  ownership?: SystemPromptOwnership;
}

export interface ListAvailableSystemPromptPresetsPayload {
  bookId: string;
}

export interface CreateSystemPromptPresetPayload {
  data: CreateSystemPromptPresetDto;
}

export interface UpdateSystemPromptPresetPayload {
  id: string;
  data: UpdateSystemPromptPresetDto;
}

export interface DeleteSystemPromptPresetPayload {
  id: string;
}

export type ActiveSystemPromptPresetIds = Record<SystemPromptCategory, string>;

export interface AiSystemPromptPresetSelection {
  category: SystemPromptCategory;
  presetId: string;
}

export interface ListActiveSystemPromptPresetsPayload {
  bookId: string;
}

export interface SetActiveSystemPromptPresetPayload {
  bookId: string;
  category: SystemPromptCategory;
  presetId: string;
}

export interface ResetActiveSystemPromptPresetPayload {
  bookId: string;
  category: SystemPromptCategory;
}
