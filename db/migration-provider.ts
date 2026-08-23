import type { Migration, MigrationProvider } from 'kysely/migration';

import { initialMigration } from './migrations/0000_initial';
import * as vectorSearchThresholdMigration from './migrations/1786908940553_add-vector-search-threshold';
import * as vectorSearchSelectionSettingsMigration from './migrations/1786918263225_add-vector-search-selection-settings';
import * as codexEntryNoteTitleMigration from './migrations/1787185071608_add-codex-entry-note-title';
import * as generalNotesMigration from './migrations/1787190000000_add-general-notes';

const migrations: Record<string, Migration> = {
  '0000_initial': initialMigration,
  '1786908940553_add-vector-search-threshold': vectorSearchThresholdMigration,
  '1786918263225_add-vector-search-selection-settings': vectorSearchSelectionSettingsMigration,
  '1787185071608_add-codex-entry-note-title': codexEntryNoteTitleMigration,
  '1787190000000_add-general-notes': generalNotesMigration,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  },
};
