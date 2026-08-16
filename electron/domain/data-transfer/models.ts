import type {
  ActiveSystemPromptPresetRow,
  ActRow,
  BookRow,
  BookSettingsRow,
  BookTagRow,
  CategoryRow,
  ChapterRow,
  ChatBranchSelectionRow,
  ChatMessageRow,
  ChatThreadRow,
  CodexEntryNoteRow,
  CodexEntryProgressionRow,
  CodexEntryRow,
  SceneRow,
  SystemPromptPresetRow,
} from '../../../db/schema';
import type { TiptapJsonDoc } from '../../../shared/models/manuscript.model';

type WithIsoDates<Row> = Omit<Row, 'createdAt' | 'lastEditedAt'> & {
  createdAt: string | null;
  lastEditedAt: string | null;
};

export type DataExportBook = WithIsoDates<Omit<BookRow, 'coverImage'>> & {
  coverImage: string | null;
};
export type DataExportBookSettings = Omit<
  BookSettingsRow,
  | 'synopsisAiContext'
  | 'openrouterEmbeddingModel'
  | 'vectorSearchEnabled'
  | 'vectorSearchThresholdEnabled'
  | 'vectorSearchManualSelectionEnabled'
  | 'automaticIndexingEnabled'
> & {
  synopsisAiContext: boolean;
  openRouterEmbeddingModel: BookSettingsRow['openrouterEmbeddingModel'];
  vectorSearchEnabled: boolean;
  vectorSearchThresholdEnabled: boolean;
  vectorSearchManualSelectionEnabled: boolean;
  automaticIndexingEnabled: boolean;
};
export type DataExportCategory = Omit<CategoryRow, 'isCustom'> & { isCustom: boolean };
export type DataExportBookTag = BookTagRow;
export type DataExportAct = ActRow;
export type DataExportChapter = ChapterRow;
export type DataExportScene = Omit<SceneRow, 'prose' | 'includeInContext'> & {
  prose: TiptapJsonDoc | null;
  includeInContext: boolean;
};
export type DataExportCodexEntry = WithIsoDates<Omit<CodexEntryRow, 'image'>> & {
  image: string | null;
};
export type DataExportCodexEntryNote = WithIsoDates<CodexEntryNoteRow>;
export type DataExportCodexEntryProgression = WithIsoDates<CodexEntryProgressionRow>;
export type DataExportChatThread = WithIsoDates<ChatThreadRow>;
export type DataExportChatMessage = WithIsoDates<ChatMessageRow>;
export type DataExportChatBranchSelection = ChatBranchSelectionRow;
export type DataExportSystemPromptPreset = Omit<
  WithIsoDates<SystemPromptPresetRow>,
  'createdAt' | 'lastEditedAt'
> & {
  createdAt: string;
  lastEditedAt: string;
};
export type DataExportActiveSystemPromptPreset = ActiveSystemPromptPresetRow;

export interface DataExportSnapshotData {
  books: DataExportBook[];
  bookSettings: DataExportBookSettings[];
  categories: DataExportCategory[];
  bookTags: DataExportBookTag[];
  acts: DataExportAct[];
  chapters: DataExportChapter[];
  scenes: DataExportScene[];
  codexEntries: DataExportCodexEntry[];
  codexEntryNotes: DataExportCodexEntryNote[];
  codexEntryProgression: DataExportCodexEntryProgression[];
  chatThreads: DataExportChatThread[];
  chatMessages: DataExportChatMessage[];
  chatBranchSelections: DataExportChatBranchSelection[];
  systemPromptPresets: DataExportSystemPromptPreset[];
  activeSystemPromptPresets: DataExportActiveSystemPromptPreset[];
}

export type DataExportScope = { type: 'book'; bookId: string } | { type: 'library' };

export interface DataExportSnapshot {
  schemaVersion: 1;
  exportedAt: string;
  scope: DataExportScope;
  data: DataExportSnapshotData;
}

export interface DataImportResult {
  importedBookIds: string[];
}
