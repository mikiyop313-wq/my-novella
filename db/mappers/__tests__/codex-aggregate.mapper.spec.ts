import { describe, expect, it } from 'vitest';

import type {
  CodexEntryNoteRow,
  CodexEntryProgressionRow,
  CodexEntryRow,
} from '../../schema';
import {
  mapCodexEntryAggregate,
  mapCodexEntryRow,
} from '../codex-aggregate.mapper';

describe('codex aggregate mapper', () => {
  it('maps binary images and defaults null timestamps to the Unix epoch', () => {
    const entry = mapCodexEntryRow(entryRow({
      image: Buffer.from([4, 5, 6]),
      createdAt: null,
    }));

    expect(entry.image).toEqual(new Uint8Array([4, 5, 6]));
    expect(entry.createdAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('assembles mapped notes and progression in supplied order', () => {
    const detail = mapCodexEntryAggregate({
      entry: entryRow(),
      entryNotes: [noteRow({ id: 'note-2' }), noteRow({ id: 'note-1' })],
      entryProgression: [
        progressionRow({ id: 'progression-2' }),
        progressionRow({ id: 'progression-1' }),
      ],
    });

    expect(detail.entryNotes.map(({ id }) => id)).toEqual(['note-2', 'note-1']);
    expect(detail.entryProgression.map(({ id }) => id))
      .toEqual(['progression-2', 'progression-1']);
    expect(detail.entryNotes[0].createdAt).toBe('1970-01-01T00:00:01.000Z');
  });
});

function entryRow(overrides: Partial<CodexEntryRow> = {}): CodexEntryRow {
  return {
    id: 'entry-1',
    bookId: 'book-1',
    type: 'character',
    name: 'Character',
    alias: null,
    description: null,
    image: null,
    status: 'active',
    trackingSetting: 'include_when_detected',
    createdAt: 1,
    lastEditedAt: 1,
    ...overrides,
  };
}

function noteRow(overrides: Partial<CodexEntryNoteRow> = {}): CodexEntryNoteRow {
  return {
    id: 'note-1',
    codexEntryId: 'entry-1',
    content: 'Note',
    createdAt: 1,
    lastEditedAt: 1,
    ...overrides,
  };
}

function progressionRow(
  overrides: Partial<CodexEntryProgressionRow> = {},
): CodexEntryProgressionRow {
  return {
    id: 'progression-1',
    codexEntryId: 'entry-1',
    title: 'Progression',
    description: 'Description',
    sceneId: null,
    createdAt: 1,
    lastEditedAt: 1,
    ...overrides,
  };
}
