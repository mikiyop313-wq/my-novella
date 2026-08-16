import type {
  BookSettingsTable,
  BookTable,
  BookTagTable,
  CategoryTable,
  LanguageTable,
  SubcategoryTable,
} from './book';
import type {
  ChatBranchSelectionTable,
  ChatMessageTable,
  ChatThreadTable,
} from './chat';
import type {
  CodexEntryNoteTable,
  CodexEntryProgressionTable,
  CodexEntryTable,
} from './codex';
import type { ActTable, ChapterTable, SceneTable } from './narrative';
import type { AppSettingsTable } from './settings';
import type {
  ActiveSystemPromptPresetTable,
  SystemPromptPresetTable,
} from './system-prompt';

export * from './book';
export * from './chat';
export * from './codex';
export * from './narrative';
export * from './settings';
export * from './system-prompt';

export interface DatabaseSchema {
  books: BookTable;
  language: LanguageTable;
  bookSettings: BookSettingsTable;
  categories: CategoryTable;
  subcategories: SubcategoryTable;
  bookTags: BookTagTable;
  chatThreads: ChatThreadTable;
  chatMessages: ChatMessageTable;
  chatBranchSelections: ChatBranchSelectionTable;
  codexEntries: CodexEntryTable;
  codexEntryNotes: CodexEntryNoteTable;
  codexEntryProgression: CodexEntryProgressionTable;
  acts: ActTable;
  chapters: ChapterTable;
  scenes: SceneTable;
  appSettings: AppSettingsTable;
  systemPromptPresets: SystemPromptPresetTable;
  activeSystemPromptPresets: ActiveSystemPromptPresetTable;
}
