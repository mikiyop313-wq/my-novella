import type {
  CodexEntryDto,
  CodexEntryType,
  DetectedCodexEntryDto,
} from '../../../../../shared/models/codex.model';

const CODEX_ENTRY_TYPES = new Set<CodexEntryType>([
  'character',
  'location',
  'object',
  'lore',
  'subplot',
  'other',
]);

export function parseCodexDetectionResponse(response: string): DetectedCodexEntryDto[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    throw new Error('AI returned invalid JSON for Codex detection.');
  }

  if (!isRecord(parsed) || !hasExactKeys(parsed, ['entries']) || !Array.isArray(parsed['entries'])) {
    throw new Error('AI returned an invalid Codex detection response.');
  }

  return parsed['entries'].map((entry) => parseEntry(entry));
}

export function filterNewCodexEntries(options: {
  detectedEntries: readonly DetectedCodexEntryDto[];
  existingEntries: readonly CodexEntryDto[];
}): DetectedCodexEntryDto[] {
  const existingNames = new Set(
    options.existingEntries.flatMap((entry) => [entry.name, entry.alias ?? ''])
      .map(normalizeName)
      .filter(Boolean),
  );
  const detectedNames = new Set<string>();

  return options.detectedEntries.filter((entry) => {
    const normalizedName = normalizeName(entry.name);
    if (existingNames.has(normalizedName) || detectedNames.has(normalizedName)) return false;

    detectedNames.add(normalizedName);
    return true;
  });
}

function parseEntry(entry: unknown): DetectedCodexEntryDto {
  if (!isRecord(entry) || !hasExactKeys(entry, ['name', 'type', 'description'])) {
    throw new Error('AI returned an invalid Codex entry.');
  }

  const name = nonEmptyString(entry['name']);
  const type = entry['type'];
  const description = nonEmptyString(entry['description']);
  if (!name || typeof type !== 'string' || !CODEX_ENTRY_TYPES.has(type as CodexEntryType) || !description) {
    throw new Error('AI returned an invalid Codex entry.');
  }

  return { name, type: type as CodexEntryType, description };
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(record);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => keys.includes(key));
}
