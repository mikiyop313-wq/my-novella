import type { SystemPromptPresetDto } from '../../shared/models/system-prompt.model';
import { fromSqliteTimestamp } from '../core/sqlite-values';
import type { SystemPromptPresetRow } from '../schema';

export function mapSystemPromptPresetRow(
  preset: SystemPromptPresetRow,
): SystemPromptPresetDto {
  return {
    ...preset,
    createdAt: fromSqliteTimestamp(preset.createdAt)!.toISOString(),
    lastEditedAt: fromSqliteTimestamp(preset.lastEditedAt)!.toISOString(),
  };
}
