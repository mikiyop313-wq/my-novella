import type { DetectedCodexEntryDto } from '../../../shared/models/codex.model';
import type { SystemPromptCategory } from '../../../shared/models/system-prompt.model';

const CODEX_DETECTION_RESPONSE: { entries: DetectedCodexEntryDto[] } = {
  entries: [{
    name: 'string',
    type: 'character',
    description: 'string',
  }],
};

const CODEX_DETECTION_RESPONSE_CONTRACT = `Return exactly one valid JSON object and no other text.
Do not use Markdown or JSON code fences.
The JSON must match this exact shape:
${JSON.stringify(CODEX_DETECTION_RESPONSE)}
"entries" must be an array. Return {"entries":[]} when there are no new entries.
Every entry must contain exactly the non-empty string fields "name", "type", and "description".
The "type" value must be one of: character, location, object, lore, subplot, other.`;

const REQUIRED_SYSTEM_PROMPT_CONTRACTS: Partial<Record<SystemPromptCategory, string>> = {
  codexDetection: CODEX_DETECTION_RESPONSE_CONTRACT,
};

export function appendRequiredSystemPromptContract(
  category: SystemPromptCategory,
  editableSystemPrompt: string,
): string {
  const requiredContract = REQUIRED_SYSTEM_PROMPT_CONTRACTS[category];
  if (!requiredContract) return editableSystemPrompt;

  const editablePrompt = editableSystemPrompt.trim();
  return editablePrompt ? `${editablePrompt}\n\n${requiredContract}` : requiredContract;
}
