import type {
  CodexEntryDetailDto,
  CodexEntryDto,
  CodexEntryNoteDto,
  CodexEntryProgressionDto,
} from '../../shared/models/codex.model';
import { fromSqliteTimestamp, toIpcBinary } from '../core/sqlite-values';
import type {
  CodexEntryNoteRow,
  CodexEntryProgressionRow,
  CodexEntryRow,
} from '../schema';

export interface CodexEntryAggregateRows {
  entry: CodexEntryRow;
  entryNotes: CodexEntryNoteRow[];
  entryProgression: CodexEntryProgressionRow[];
}

export function mapCodexEntryRow(entry: CodexEntryRow): CodexEntryDto {
  return {
    ...entry,
    image: toIpcBinary(entry.image),
    createdAt: dateToIso(entry.createdAt),
    lastEditedAt: dateToIso(entry.lastEditedAt),
  };
}

export function mapCodexEntryNoteRow(note: CodexEntryNoteRow): CodexEntryNoteDto {
  return {
    ...note,
    createdAt: dateToIso(note.createdAt),
    lastEditedAt: dateToIso(note.lastEditedAt),
  };
}

export function mapCodexEntryProgressionRow(
  progression: CodexEntryProgressionRow,
): CodexEntryProgressionDto {
  return {
    ...progression,
    createdAt: dateToIso(progression.createdAt),
    lastEditedAt: dateToIso(progression.lastEditedAt),
  };
}

export function mapCodexEntryAggregate({
  entry,
  entryNotes,
  entryProgression,
}: CodexEntryAggregateRows): CodexEntryDetailDto {
  return {
    ...mapCodexEntryRow(entry),
    entryNotes: entryNotes.map(mapCodexEntryNoteRow),
    entryProgression: entryProgression.map(mapCodexEntryProgressionRow),
  };
}

function dateToIso(value: number | null): string {
  return (fromSqliteTimestamp(value) ?? new Date(0)).toISOString();
}
