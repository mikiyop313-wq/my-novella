import { findBuiltInSystemPromptPreset } from '../../../shared/constants/ai-system-prompts';

import type { DataExportSnapshot } from './models';

type UnknownRecord = Record<string, unknown>;

const DATA_KEYS = [
  'books',
  'bookSettings',
  'categories',
  'bookTags',
  'acts',
  'chapters',
  'scenes',
  'codexEntries',
  'codexEntryNotes',
  'codexEntryProgression',
  'chatThreads',
  'chatMessages',
  'chatBranchSelections',
  'systemPromptPresets',
  'activeSystemPromptPresets',
] as const;

const BOOK_STATUSES = ['archived', 'draft'] as const;
const CATEGORY_TYPES = ['genre', 'trope', 'demographic'] as const;
const PROSE_TENSES = ['past', 'present'] as const;
const POINTS_OF_VIEW = ['first', 'second', 'third_limited', 'third_omni'] as const;
const EMBEDDING_MODELS = ['local', 'openAI', 'voyage', 'openRouter'] as const;
const NARRATIVE_STATUSES = ['active', 'archived'] as const;
const CODEX_ENTRY_TYPES = ['character', 'location', 'object', 'lore', 'subplot', 'other'] as const;
const CODEX_TRACKING_SETTINGS = [
  'always_include',
  'include_when_detected',
  'manual',
  'never_include',
] as const;
const CHAT_MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
const CHAT_MESSAGE_STATUSES = ['pending', 'streaming', 'complete', 'failed', 'aborted'] as const;
const SYSTEM_PROMPT_CATEGORIES = [
  'chat',
  'sceneBeat',
  'rephrase',
  'summary',
  'expand',
  'shorten',
  'codexDetection',
  'title',
] as const;
const LOCAL_EMBEDDING_MODELS = [
  'mixedbread-ai/mxbai-embed-large-v1',
  'BAAI/bge-large-en-v1.5',
  'BAAI/bge-m3',
  'nomic-ai/nomic-embed-text-v1.5',
  'BAAI/bge-base-en-v1.5',
  'Alibaba-NLP/gte-multilingual-base',
  'BAAI/bge-small-en-v1.5',
  'sentence-transformers/all-MiniLM-L6-v2',
  'Snowflake/snowflake-arctic-embed-xs',
] as const;
const OPEN_ROUTER_EMBEDDING_MODELS = [
  'voyageai/voyage-multimodal-3.5',
  'voyageai/voyage-4-lite',
  'voyageai/voyage-4',
  'voyageai/voyage-4-large',
  'google/gemini-embedding-2',
  'openai/text-embedding-3-large',
  'openai/text-embedding-3-small',
  'nvidia/nemotron-3-embed-1b:free',
  'qwen/qwen3-embedding-8b',
  'qwen/qwen3-embedding-4b',
] as const;

/** Validates portable archive metadata and data before import. */
export function validateTransferArchive(value: unknown): DataExportSnapshot {
  const snapshot = exactObject(value, '$', ['schemaVersion', 'exportedAt', 'scope', 'data']);
  equal(snapshot['schemaVersion'], 1, '$.schemaVersion');
  isoDate(snapshot['exportedAt'], '$.exportedAt', false);

  const scope = record(snapshot['scope'], '$.scope');
  const scopeType = string(scope['type'], '$.scope.type');
  if (scopeType === 'book') {
    exactKeys(scope, '$.scope', ['type', 'bookId']);
    string(scope['bookId'], '$.scope.bookId');
  } else if (scopeType === 'library') {
    exactKeys(scope, '$.scope', ['type']);
  } else {
    invalid('$.scope.type', 'expected "book" or "library"');
  }

  const data = exactObject(snapshot['data'], '$.data', DATA_KEYS);
  validateRows(data);
  validateRelationships({ scope, data });

  return value as DataExportSnapshot;
}

function validateRows(data: UnknownRecord): void {
  rows(
    data,
    'books',
    [
      'id',
      'title',
      'author',
      'status',
      'synopsis',
      'language',
      'coverImage',
      'wordCount',
      'createdAt',
      'lastEditedAt',
    ],
    (row, path) => {
      requiredStrings(row, path, ['id', 'title', 'author', 'language']);
      enumeration(row['status'], `${path}.status`, BOOK_STATUSES);
      nullableString(row['synopsis'], `${path}.synopsis`);
      base64(row['coverImage'], `${path}.coverImage`);
      nullableInteger(row['wordCount'], `${path}.wordCount`);
      isoDate(row['createdAt'], `${path}.createdAt`, true);
      isoDate(row['lastEditedAt'], `${path}.lastEditedAt`, true);
    },
  );

  rows(
    data,
    'bookSettings',
    [
      'bookSettingId',
      'language',
      'proseTense',
      'pointOfView',
      'synopsisAiContext',
      'povCharacterId',
      'embeddingModel',
      'localEmbeddingModel',
      'openRouterEmbeddingModel',
      'vectorSearchEnabled',
      'automaticIndexingEnabled',
    ],
    (row, path) => {
      requiredStrings(row, path, ['bookSettingId', 'language']);
      enumeration(row['proseTense'], `${path}.proseTense`, PROSE_TENSES);
      enumeration(row['pointOfView'], `${path}.pointOfView`, POINTS_OF_VIEW);
      boolean(row['synopsisAiContext'], `${path}.synopsisAiContext`);
      nullableString(row['povCharacterId'], `${path}.povCharacterId`);
      nullableEnumeration(row['embeddingModel'], `${path}.embeddingModel`, EMBEDDING_MODELS);
      nullableEnumeration(
        row['localEmbeddingModel'],
        `${path}.localEmbeddingModel`,
        LOCAL_EMBEDDING_MODELS,
      );
      nullableEnumeration(
        row['openRouterEmbeddingModel'],
        `${path}.openRouterEmbeddingModel`,
        OPEN_ROUTER_EMBEDDING_MODELS,
      );
      boolean(row['vectorSearchEnabled'], `${path}.vectorSearchEnabled`);
      boolean(row['automaticIndexingEnabled'], `${path}.automaticIndexingEnabled`);
    },
  );

  rows(data, 'categories', ['id', 'name', 'type', 'isCustom'], (row, path) => {
    requiredStrings(row, path, ['id', 'name']);
    enumeration(row['type'], `${path}.type`, CATEGORY_TYPES);
    boolean(row['isCustom'], `${path}.isCustom`);
  });
  rows(data, 'bookTags', ['bookId', 'categoryId'], requiredStringFields(['bookId', 'categoryId']));

  rows(data, 'acts', ['id', 'title', 'bookId', 'position', 'status', 'summary'], (row, path) => {
    requiredStrings(row, path, ['id', 'title', 'bookId']);
    integer(row['position'], `${path}.position`);
    enumeration(row['status'], `${path}.status`, NARRATIVE_STATUSES);
    nullableString(row['summary'], `${path}.summary`);
  });
  rows(
    data,
    'chapters',
    ['id', 'title', 'bookId', 'actId', 'position', 'status', 'archiveParentTitle', 'summary'],
    (row, path) => {
      requiredStrings(row, path, ['id', 'title', 'bookId']);
      nullableString(row['actId'], `${path}.actId`);
      integer(row['position'], `${path}.position`);
      enumeration(row['status'], `${path}.status`, NARRATIVE_STATUSES);
      nullableString(row['archiveParentTitle'], `${path}.archiveParentTitle`);
      nullableString(row['summary'], `${path}.summary`);
    },
  );
  rows(
    data,
    'scenes',
    [
      'id',
      'title',
      'bookId',
      'chapterId',
      'position',
      'status',
      'archiveParentTitle',
      'prose',
      'summary',
      'wordCount',
      'includeInContext',
      'pointOfViewOverride',
      'povCharacterIdOverride',
    ],
    (row, path) => {
      requiredStrings(row, path, ['id', 'title', 'bookId']);
      nullableString(row['chapterId'], `${path}.chapterId`);
      integer(row['position'], `${path}.position`);
      enumeration(row['status'], `${path}.status`, NARRATIVE_STATUSES);
      nullableString(row['archiveParentTitle'], `${path}.archiveParentTitle`);
      nullableJson(row['prose'], `${path}.prose`);
      nullableString(row['summary'], `${path}.summary`);
      nullableInteger(row['wordCount'], `${path}.wordCount`);
      boolean(row['includeInContext'], `${path}.includeInContext`);
      nullableEnumeration(
        row['pointOfViewOverride'],
        `${path}.pointOfViewOverride`,
        POINTS_OF_VIEW,
      );
      nullableString(row['povCharacterIdOverride'], `${path}.povCharacterIdOverride`);
    },
  );

  rows(
    data,
    'codexEntries',
    [
      'id',
      'bookId',
      'type',
      'name',
      'alias',
      'description',
      'image',
      'status',
      'trackingSetting',
      'createdAt',
      'lastEditedAt',
    ],
    (row, path) => {
      requiredStrings(row, path, ['id', 'bookId', 'name']);
      enumeration(row['type'], `${path}.type`, CODEX_ENTRY_TYPES);
      nullableString(row['alias'], `${path}.alias`);
      nullableString(row['description'], `${path}.description`);
      base64(row['image'], `${path}.image`);
      enumeration(row['status'], `${path}.status`, NARRATIVE_STATUSES);
      enumeration(row['trackingSetting'], `${path}.trackingSetting`, CODEX_TRACKING_SETTINGS);
      isoDate(row['createdAt'], `${path}.createdAt`, true);
      isoDate(row['lastEditedAt'], `${path}.lastEditedAt`, true);
    },
  );
  rows(
    data,
    'codexEntryNotes',
    ['id', 'codexEntryId', 'content', 'createdAt', 'lastEditedAt'],
    (row, path) => {
      requiredStrings(row, path, ['id', 'codexEntryId', 'content']);
      isoDate(row['createdAt'], `${path}.createdAt`, true);
      isoDate(row['lastEditedAt'], `${path}.lastEditedAt`, true);
    },
  );
  rows(
    data,
    'codexEntryProgression',
    ['id', 'codexEntryId', 'title', 'description', 'sceneId', 'createdAt', 'lastEditedAt'],
    (row, path) => {
      requiredStrings(row, path, ['id', 'codexEntryId', 'title', 'description']);
      nullableString(row['sceneId'], `${path}.sceneId`);
      isoDate(row['createdAt'], `${path}.createdAt`, true);
      isoDate(row['lastEditedAt'], `${path}.lastEditedAt`, true);
    },
  );

  rows(
    data,
    'chatThreads',
    ['id', 'bookId', 'title', 'status', 'lastModelId', 'createdAt', 'lastEditedAt'],
    (row, path) => {
      requiredStrings(row, path, ['id', 'bookId', 'title']);
      enumeration(row['status'], `${path}.status`, NARRATIVE_STATUSES);
      nullableString(row['lastModelId'], `${path}.lastModelId`);
      isoDate(row['createdAt'], `${path}.createdAt`, true);
      isoDate(row['lastEditedAt'], `${path}.lastEditedAt`, true);
    },
  );
  rows(
    data,
    'chatMessages',
    [
      'id',
      'threadId',
      'parentMessageId',
      'branchGroupId',
      'branchOrder',
      'role',
      'content',
      'status',
      'position',
      'modelId',
      'provider',
      'inputTokens',
      'outputTokens',
      'reasoningSummary',
      'error',
      'createdAt',
      'lastEditedAt',
    ],
    (row, path) => {
      requiredStrings(row, path, ['id', 'threadId', 'branchGroupId', 'content']);
      nullableString(row['parentMessageId'], `${path}.parentMessageId`);
      integer(row['branchOrder'], `${path}.branchOrder`);
      enumeration(row['role'], `${path}.role`, CHAT_MESSAGE_ROLES);
      enumeration(row['status'], `${path}.status`, CHAT_MESSAGE_STATUSES);
      integer(row['position'], `${path}.position`);
      nullableString(row['modelId'], `${path}.modelId`);
      nullableString(row['provider'], `${path}.provider`);
      nullableInteger(row['inputTokens'], `${path}.inputTokens`);
      nullableInteger(row['outputTokens'], `${path}.outputTokens`);
      nullableString(row['reasoningSummary'], `${path}.reasoningSummary`);
      nullableString(row['error'], `${path}.error`);
      isoDate(row['createdAt'], `${path}.createdAt`, true);
      isoDate(row['lastEditedAt'], `${path}.lastEditedAt`, true);
    },
  );
  rows(
    data,
    'chatBranchSelections',
    ['threadId', 'branchGroupId', 'selectedMessageId'],
    requiredStringFields(['threadId', 'branchGroupId', 'selectedMessageId']),
  );

  rows(
    data,
    'systemPromptPresets',
    [
      'id',
      'name',
      'systemPrompt',
      'category',
      'scope',
      'bookId',
      'temperature',
      'topP',
      'maxOutputTokens',
      'presencePenalty',
      'frequencyPenalty',
      'defaultModelId',
      'createdAt',
      'lastEditedAt',
    ],
    (row, path) => {
      requiredStrings(row, path, ['id', 'name', 'systemPrompt']);
      enumeration(row['category'], `${path}.category`, SYSTEM_PROMPT_CATEGORIES);
      equal(row['scope'], 'book', `${path}.scope`);
      string(row['bookId'], `${path}.bookId`);
      finiteNumber(row['temperature'], `${path}.temperature`);
      finiteNumber(row['topP'], `${path}.topP`);
      nullableInteger(row['maxOutputTokens'], `${path}.maxOutputTokens`);
      finiteNumber(row['presencePenalty'], `${path}.presencePenalty`);
      finiteNumber(row['frequencyPenalty'], `${path}.frequencyPenalty`);
      nullableString(row['defaultModelId'], `${path}.defaultModelId`);
      isoDate(row['createdAt'], `${path}.createdAt`, false);
      isoDate(row['lastEditedAt'], `${path}.lastEditedAt`, false);
    },
  );
  rows(data, 'activeSystemPromptPresets', ['bookId', 'category', 'presetId'], (row, path) => {
    requiredStrings(row, path, ['bookId', 'presetId']);
    enumeration(row['category'], `${path}.category`, SYSTEM_PROMPT_CATEGORIES);
  });
}

function validateRelationships({
  scope,
  data,
}: {
  scope: UnknownRecord;
  data: UnknownRecord;
}): void {
  const books = typedRows(data, 'books');
  const settings = typedRows(data, 'bookSettings');
  const categories = typedRows(data, 'categories');
  const tags = typedRows(data, 'bookTags');
  const acts = typedRows(data, 'acts');
  const chapters = typedRows(data, 'chapters');
  const scenes = typedRows(data, 'scenes');
  const codexEntries = typedRows(data, 'codexEntries');
  const notes = typedRows(data, 'codexEntryNotes');
  const progression = typedRows(data, 'codexEntryProgression');
  const threads = typedRows(data, 'chatThreads');
  const messages = typedRows(data, 'chatMessages');
  const selections = typedRows(data, 'chatBranchSelections');
  const presets = typedRows(data, 'systemPromptPresets');
  const activePresets = typedRows(data, 'activeSystemPromptPresets');

  uniqueRows(books, 'books', (row) => row['id']);
  uniqueRows(settings, 'bookSettings', (row) => row['bookSettingId']);
  uniqueRows(categories, 'categories', (row) => row['id']);
  uniqueRows(categories, 'categories', (row) => `${row['type']}\0${row['name']}`, 'name and type');
  uniqueRows(tags, 'bookTags', (row) => `${row['bookId']}\0${row['categoryId']}`);
  uniqueRows(acts, 'acts', (row) => row['id']);
  uniqueRows(chapters, 'chapters', (row) => row['id']);
  uniqueRows(scenes, 'scenes', (row) => row['id']);
  uniqueRows(codexEntries, 'codexEntries', (row) => row['id']);
  uniqueRows(notes, 'codexEntryNotes', (row) => row['id']);
  uniqueRows(progression, 'codexEntryProgression', (row) => row['id']);
  uniqueRows(threads, 'chatThreads', (row) => row['id']);
  uniqueRows(messages, 'chatMessages', (row) => row['id']);
  uniqueRows(
    selections,
    'chatBranchSelections',
    (row) => `${row['threadId']}\0${row['branchGroupId']}`,
  );
  uniqueRows(presets, 'systemPromptPresets', (row) => row['id']);
  uniqueRows(
    activePresets,
    'activeSystemPromptPresets',
    (row) => `${row['bookId']}\0${row['category']}`,
  );

  const bookById = byId(books);
  const categoryById = byId(categories);
  const actById = byId(acts);
  const chapterById = byId(chapters);
  const sceneById = byId(scenes);
  const codexById = byId(codexEntries);
  const threadById = byId(threads);
  const messageById = byId(messages);
  const presetById = byId(presets);

  if (scope['type'] === 'book') {
    if (books.length !== 1 || books[0]['id'] !== scope['bookId']) {
      invalid('$.data.books', 'book scope must contain exactly the declared book');
    }
  }

  for (const [index, row] of settings.entries()) {
    const path = `$.data.bookSettings[${index}]`;
    reference(bookById, row['bookSettingId'], `${path}.bookSettingId`, 'book');
    validateCharacterReference({
      value: row['povCharacterId'],
      path: `${path}.povCharacterId`,
      bookId: row['bookSettingId'],
      codexById,
    });
  }
  if (settings.length !== books.length) {
    invalid('$.data.bookSettings', 'expected exactly one settings row for every book');
  }
  for (const [index, row] of tags.entries()) {
    reference(bookById, row['bookId'], `$.data.bookTags[${index}].bookId`, 'book');
    reference(categoryById, row['categoryId'], `$.data.bookTags[${index}].categoryId`, 'category');
  }
  for (const [index, row] of acts.entries()) {
    reference(bookById, row['bookId'], `$.data.acts[${index}].bookId`, 'book');
  }
  for (const [index, row] of chapters.entries()) {
    const path = `$.data.chapters[${index}]`;
    reference(bookById, row['bookId'], `${path}.bookId`, 'book');
    const parent = nullableReference(actById, row['actId'], `${path}.actId`, 'act');
    sameBook(row, parent, `${path}.actId`);
    if (row['status'] === 'active' && (!parent || parent['status'] !== 'active')) {
      invalid(`${path}.actId`, 'active chapter requires an active parent act');
    }
  }
  for (const [index, row] of scenes.entries()) {
    const path = `$.data.scenes[${index}]`;
    reference(bookById, row['bookId'], `${path}.bookId`, 'book');
    const parent = nullableReference(chapterById, row['chapterId'], `${path}.chapterId`, 'chapter');
    sameBook(row, parent, `${path}.chapterId`);
    if (row['status'] === 'active' && (!parent || parent['status'] !== 'active')) {
      invalid(`${path}.chapterId`, 'active scene requires an active parent chapter');
    }
    validateCharacterReference({
      value: row['povCharacterIdOverride'],
      path: `${path}.povCharacterIdOverride`,
      bookId: row['bookId'],
      codexById,
    });
  }
  for (const [index, row] of codexEntries.entries()) {
    reference(bookById, row['bookId'], `$.data.codexEntries[${index}].bookId`, 'book');
  }
  for (const [index, row] of notes.entries()) {
    reference(
      codexById,
      row['codexEntryId'],
      `$.data.codexEntryNotes[${index}].codexEntryId`,
      'Codex entry',
    );
  }
  for (const [index, row] of progression.entries()) {
    const path = `$.data.codexEntryProgression[${index}]`;
    const entry = reference(codexById, row['codexEntryId'], `${path}.codexEntryId`, 'Codex entry');
    const progressionScene = nullableReference(
      sceneById,
      row['sceneId'],
      `${path}.sceneId`,
      'scene',
    );
    if (progressionScene && progressionScene['bookId'] !== entry['bookId']) {
      invalid(`${path}.sceneId`, 'scene must belong to the same book as the Codex entry');
    }
  }
  for (const [index, row] of threads.entries()) {
    reference(bookById, row['bookId'], `$.data.chatThreads[${index}].bookId`, 'book');
  }
  for (const [index, row] of messages.entries()) {
    const path = `$.data.chatMessages[${index}]`;
    const thread = reference(threadById, row['threadId'], `${path}.threadId`, 'chat thread');
    const parent = nullableReference(
      messageById,
      row['parentMessageId'],
      `${path}.parentMessageId`,
      'chat message',
    );
    if (parent && parent['threadId'] !== thread['id']) {
      invalid(`${path}.parentMessageId`, 'parent message must belong to the same thread');
    }
  }
  validateMessageCycles(messages, messageById);
  for (const [index, row] of selections.entries()) {
    const path = `$.data.chatBranchSelections[${index}]`;
    reference(threadById, row['threadId'], `${path}.threadId`, 'chat thread');
    const selected = reference(
      messageById,
      row['selectedMessageId'],
      `${path}.selectedMessageId`,
      'chat message',
    );
    if (
      selected['threadId'] !== row['threadId'] ||
      selected['branchGroupId'] !== row['branchGroupId']
    ) {
      invalid(
        `${path}.selectedMessageId`,
        'selected message must belong to the selected thread and branch group',
      );
    }
  }
  for (const [index, row] of presets.entries()) {
    reference(bookById, row['bookId'], `$.data.systemPromptPresets[${index}].bookId`, 'book');
  }
  for (const [index, row] of activePresets.entries()) {
    const path = `$.data.activeSystemPromptPresets[${index}]`;
    reference(bookById, row['bookId'], `${path}.bookId`, 'book');
    const importedPreset = presetById.get(row['presetId'] as string);
    const builtInPreset = findBuiltInSystemPromptPreset(row['presetId'] as string);
    if (!importedPreset && !builtInPreset) {
      invalid(`${path}.presetId`, 'expected an imported or built-in system prompt preset');
    }
    const preset = importedPreset ?? (builtInPreset as unknown as UnknownRecord);
    if (preset['category'] !== row['category']) {
      invalid(`${path}.presetId`, 'preset category does not match the active category');
    }
    if (importedPreset && importedPreset['bookId'] !== row['bookId']) {
      invalid(`${path}.presetId`, 'custom preset must belong to the same book');
    }
  }
}

function validateCharacterReference({
  value,
  path,
  bookId,
  codexById,
}: {
  value: unknown;
  path: string;
  bookId: unknown;
  codexById: Map<string, UnknownRecord>;
}): void {
  const entry = nullableReference(codexById, value, path, 'Codex entry');
  if (entry && (entry['bookId'] !== bookId || entry['type'] !== 'character')) {
    invalid(path, 'expected a character from the same book');
  }
}

function validateMessageCycles(
  messages: UnknownRecord[],
  messageById: Map<string, UnknownRecord>,
): void {
  for (const [index, message] of messages.entries()) {
    const seen = new Set<string>();
    let current: UnknownRecord | undefined = message;
    while (current) {
      const id = current['id'] as string;
      if (seen.has(id)) {
        invalid(
          `$.data.chatMessages[${index}].parentMessageId`,
          'chat message parent cycle detected',
        );
      }
      seen.add(id);
      const parentId = current['parentMessageId'];
      current = typeof parentId === 'string' ? messageById.get(parentId) : undefined;
    }
  }
}

function sameBook(child: UnknownRecord, parent: UnknownRecord | undefined, path: string): void {
  if (parent && parent['bookId'] !== child['bookId']) {
    invalid(path, 'parent must belong to the same book');
  }
}

function byId(rowsToIndex: UnknownRecord[]): Map<string, UnknownRecord> {
  return new Map(rowsToIndex.map((row) => [row['id'] as string, row]));
}

function reference(
  index: Map<string, UnknownRecord>,
  value: unknown,
  path: string,
  label: string,
): UnknownRecord {
  const referenced = index.get(value as string);
  if (!referenced) invalid(path, `referenced ${label} was not included`);
  return referenced;
}

function nullableReference(
  index: Map<string, UnknownRecord>,
  value: unknown,
  path: string,
  label: string,
): UnknownRecord | undefined {
  return value === null ? undefined : reference(index, value, path, label);
}

function uniqueRows(
  values: UnknownRecord[],
  table: string,
  key: (row: UnknownRecord) => unknown,
  label = 'key',
): void {
  const seen = new Set<unknown>();
  for (const [index, row] of values.entries()) {
    const value = key(row);
    if (seen.has(value)) invalid(`$.data.${table}[${index}]`, `duplicate ${label}`);
    seen.add(value);
  }
}

function rows(
  data: UnknownRecord,
  key: string,
  keys: readonly string[],
  validate: (row: UnknownRecord, path: string) => void,
): void {
  const value = data[key];
  if (!Array.isArray(value)) invalid(`$.data.${key}`, 'expected an array');
  value.forEach((item, index) => {
    const path = `$.data.${key}[${index}]`;
    const row = exactObject(item, path, keys);
    validate(row, path);
  });
}

function typedRows(data: UnknownRecord, key: string): UnknownRecord[] {
  return data[key] as UnknownRecord[];
}

function requiredStringFields(keys: readonly string[]): (row: UnknownRecord, path: string) => void {
  return (row, path) => requiredStrings(row, path, keys);
}

function requiredStrings(row: UnknownRecord, path: string, keys: readonly string[]): void {
  for (const key of keys) string(row[key], `${path}.${key}`);
}

function exactObject(value: unknown, path: string, keys: readonly string[]): UnknownRecord {
  const object = record(value, path);
  exactKeys(object, path, keys);
  return object;
}

function exactKeys(value: UnknownRecord, path: string, keys: readonly string[]): void {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) invalid(`${path}.${key}`, 'unexpected field');
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key))
      invalid(`${path}.${key}`, 'missing field');
  }
}

function record(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(path, 'expected an object');
  }
  return value as UnknownRecord;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') invalid(path, 'expected a string');
  return value;
}

function nullableString(value: unknown, path: string): void {
  if (value !== null) string(value, path);
}

function boolean(value: unknown, path: string): void {
  if (typeof value !== 'boolean') invalid(path, 'expected a boolean');
}

function integer(value: unknown, path: string): void {
  if (!Number.isInteger(value)) invalid(path, 'expected an integer');
}

function nullableInteger(value: unknown, path: string): void {
  if (value !== null) integer(value, path);
}

function finiteNumber(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value))
    invalid(path, 'expected a finite number');
}

function enumeration(value: unknown, path: string, allowed: readonly string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    invalid(path, `expected one of: ${allowed.join(', ')}`);
  }
}

function nullableEnumeration(value: unknown, path: string, allowed: readonly string[]): void {
  if (value !== null) enumeration(value, path, allowed);
}

function equal(value: unknown, expected: unknown, path: string): void {
  if (value !== expected) invalid(path, `expected ${JSON.stringify(expected)}`);
}

function isoDate(value: unknown, path: string, nullable: boolean): void {
  if (nullable && value === null) return;
  const serialized = string(value, path);
  const parsed = new Date(serialized);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== serialized) {
    invalid(path, 'expected a canonical ISO timestamp');
  }
}

function base64(value: unknown, path: string): void {
  if (value === null) return;
  const serialized = string(value, path);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(serialized)) {
    invalid(path, 'expected canonical base64 data');
  }
}

function nullableJson(value: unknown, path: string): void {
  if (value === null) return;
  validateJson(value, path);
  const prose = record(value, path);
  if (prose['type'] !== 'doc') invalid(`${path}.type`, 'expected a Tiptap doc');
}

function validateJson(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    finiteNumber(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJson(item, `${path}[${index}]`));
    return;
  }
  const object = record(value, path);
  for (const [key, item] of Object.entries(object)) validateJson(item, `${path}.${key}`);
}

function invalid(path: string, message: string): never {
  throw new Error(`Invalid transfer archive at ${path}: ${message}.`);
}
