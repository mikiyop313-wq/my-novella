import type {
  act,
  activeSystemPromptPresets,
  books,
  bookSettings,
  bookTags,
  categories,
  chapter,
  chatBranchSelections,
  chatMessages,
  chatThreads,
  codexEntries,
  codexEntryNotes,
  codexEntryProgression,
  scene,
  systemPromptPresets,
} from '../../../db/schema';

type IsoDate<Value> = Value extends Date ? string : Value;
type WithIsoDates<Row, Keys extends keyof Row> = Omit<Row, Keys> & {
  [Key in Keys]: IsoDate<Row[Key]>;
};

type BookWithBase64Cover = Omit<typeof books.$inferSelect, 'coverImage'> & {
  coverImage: string | null;
};
type CodexEntryWithBase64Image = Omit<typeof codexEntries.$inferSelect, 'image'> & {
  image: string | null;
};

export type DataExportBook = WithIsoDates<BookWithBase64Cover, 'createdAt' | 'lastEditedAt'>;
export type DataExportBookSettings = typeof bookSettings.$inferSelect;
export type DataExportCategory = typeof categories.$inferSelect;
export type DataExportBookTag = typeof bookTags.$inferSelect;
export type DataExportAct = typeof act.$inferSelect;
export type DataExportChapter = typeof chapter.$inferSelect;
export type DataExportScene = typeof scene.$inferSelect;
export type DataExportCodexEntry = WithIsoDates<
  CodexEntryWithBase64Image,
  'createdAt' | 'lastEditedAt'
>;
export type DataExportCodexEntryNote = WithIsoDates<
  typeof codexEntryNotes.$inferSelect,
  'createdAt' | 'lastEditedAt'
>;
export type DataExportCodexEntryProgression = WithIsoDates<
  typeof codexEntryProgression.$inferSelect,
  'createdAt' | 'lastEditedAt'
>;
export type DataExportChatThread = WithIsoDates<
  typeof chatThreads.$inferSelect,
  'createdAt' | 'lastEditedAt'
>;
export type DataExportChatMessage = WithIsoDates<
  typeof chatMessages.$inferSelect,
  'createdAt' | 'lastEditedAt'
>;
export type DataExportChatBranchSelection = typeof chatBranchSelections.$inferSelect;
export type DataExportSystemPromptPreset = WithIsoDates<
  typeof systemPromptPresets.$inferSelect,
  'createdAt' | 'lastEditedAt'
>;
export type DataExportActiveSystemPromptPreset = typeof activeSystemPromptPresets.$inferSelect;

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
