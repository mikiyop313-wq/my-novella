import type { DataExportSnapshot } from '../models';

const timestamp = '2026-08-14T12:00:00.000Z';

export function completeSnapshot(): DataExportSnapshot {
  return {
    schemaVersion: 1,
    exportedAt: timestamp,
    scope: { type: 'book', bookId: 'book-1' },
    data: {
      books: [
        {
          id: 'book-1',
          title: 'Novel',
          author: 'Author',
          status: 'draft',
          synopsis: 'Synopsis',
          language: 'english',
          coverImage: 'Y292ZXI=',
          wordCount: 12,
          createdAt: timestamp,
          lastEditedAt: timestamp,
        },
      ],
      bookSettings: [
        {
          bookSettingId: 'book-1',
          language: 'english',
          proseTense: 'past',
          pointOfView: 'third_limited',
          synopsisAiContext: true,
          povCharacterId: 'codex-1',
          embeddingModel: 'local',
          localEmbeddingModel: 'BAAI/bge-m3',
          openRouterEmbeddingModel: null,
          vectorSearchEnabled: true,
          automaticIndexingEnabled: false,
        },
      ],
      categories: [
        { id: 'category-existing', name: 'Fantasy', type: 'genre', isCustom: false },
        { id: 'category-new', name: 'Quest', type: 'trope', isCustom: true },
      ],
      bookTags: [
        { bookId: 'book-1', categoryId: 'category-existing' },
        { bookId: 'book-1', categoryId: 'category-new' },
      ],
      acts: [
        {
          id: 'act-1',
          title: 'Act',
          bookId: 'book-1',
          position: 0,
          status: 'active',
          summary: null,
        },
      ],
      chapters: [
        {
          id: 'chapter-1',
          title: 'Chapter',
          bookId: 'book-1',
          actId: 'act-1',
          position: 0,
          status: 'active',
          archiveParentTitle: null,
          summary: null,
        },
      ],
      scenes: [
        {
          id: 'scene-1',
          title: 'Scene',
          bookId: 'book-1',
          chapterId: 'chapter-1',
          position: 0,
          status: 'active',
          archiveParentTitle: null,
          prose: { type: 'doc', content: [] },
          summary: null,
          wordCount: 12,
          includeInContext: true,
          pointOfViewOverride: null,
          povCharacterIdOverride: 'codex-1',
        },
      ],
      codexEntries: [
        {
          id: 'codex-1',
          bookId: 'book-1',
          type: 'character',
          name: 'Ada',
          alias: null,
          description: 'Hero',
          image: 'cG9ydHJhaXQ=',
          status: 'active',
          trackingSetting: 'include_when_detected',
          createdAt: timestamp,
          lastEditedAt: timestamp,
        },
      ],
      codexEntryNotes: [
        {
          id: 'note-1',
          codexEntryId: 'codex-1',
          content: 'Note',
          createdAt: timestamp,
          lastEditedAt: timestamp,
        },
      ],
      codexEntryProgression: [
        {
          id: 'progression-1',
          codexEntryId: 'codex-1',
          title: 'Change',
          description: 'Changed',
          sceneId: 'scene-1',
          createdAt: timestamp,
          lastEditedAt: timestamp,
        },
      ],
      chatThreads: [
        {
          id: 'thread-1',
          bookId: 'book-1',
          title: 'Chat',
          status: 'active',
          lastModelId: null,
          createdAt: timestamp,
          lastEditedAt: timestamp,
        },
      ],
      chatMessages: [
        {
          id: 'message-1',
          threadId: 'thread-1',
          parentMessageId: null,
          branchGroupId: 'branch-1',
          branchOrder: 0,
          role: 'user',
          content: 'Hello',
          status: 'complete',
          position: 0,
          modelId: null,
          provider: null,
          inputTokens: null,
          outputTokens: null,
          reasoningSummary: null,
          error: null,
          createdAt: timestamp,
          lastEditedAt: timestamp,
        },
      ],
      chatBranchSelections: [
        {
          threadId: 'thread-1',
          branchGroupId: 'branch-1',
          selectedMessageId: 'message-1',
        },
      ],
      systemPromptPresets: [
        {
          id: 'preset-1',
          name: 'Prompt',
          systemPrompt: 'Write.',
          category: 'chat',
          scope: 'book',
          bookId: 'book-1',
          temperature: 0.5,
          topP: 1,
          maxOutputTokens: null,
          presencePenalty: 0,
          frequencyPenalty: 0,
          defaultModelId: null,
          createdAt: timestamp,
          lastEditedAt: timestamp,
        },
      ],
      activeSystemPromptPresets: [
        { bookId: 'book-1', category: 'chat', presetId: 'preset-1' },
        { bookId: 'book-1', category: 'title', presetId: 'default-title' },
      ],
    },
  };
}

export function emptyLibrarySnapshot(): DataExportSnapshot {
  const snapshot = completeSnapshot();
  return {
    ...snapshot,
    scope: { type: 'library' },
    data: Object.fromEntries(
      Object.keys(snapshot.data).map((key) => [key, []]),
    ) as unknown as DataExportSnapshot['data'],
  };
}
