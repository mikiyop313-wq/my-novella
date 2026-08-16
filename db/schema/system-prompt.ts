import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type {
  SystemPromptCategory,
  SystemPromptScope,
} from '../../shared/models/system-prompt.model';
import type { SqliteTimestamp } from '../core/sqlite-values';

export interface SystemPromptPresetTable {
  id: string;
  name: string;
  systemPrompt: string;
  category: SystemPromptCategory;
  scope: SystemPromptScope;
  bookId: Generated<string | null>;
  temperature: Generated<number>;
  topP: Generated<number>;
  maxOutputTokens: Generated<number | null>;
  presencePenalty: Generated<number>;
  frequencyPenalty: Generated<number>;
  defaultModelId: Generated<string | null>;
  createdAt: SqliteTimestamp;
  lastEditedAt: SqliteTimestamp;
}

export interface ActiveSystemPromptPresetTable {
  bookId: string;
  category: SystemPromptCategory;
  presetId: string;
}

export type SystemPromptPresetRow = Selectable<SystemPromptPresetTable>;
export type NewSystemPromptPresetRow = Insertable<SystemPromptPresetTable>;
export type SystemPromptPresetUpdate = Updateable<SystemPromptPresetTable>;
export type ActiveSystemPromptPresetRow = Selectable<ActiveSystemPromptPresetTable>;
export type NewActiveSystemPromptPresetRow = Insertable<ActiveSystemPromptPresetTable>;
