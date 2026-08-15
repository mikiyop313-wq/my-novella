import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import type { DataExportSnapshot } from '../models';
import {
  createTransferArchive,
  readTransferArchive,
  TRANSFER_ARCHIVE_ENTRY_NAME,
} from '../transfer-archive';

describe('transfer archive', () => {
  it('creates a compressed archive containing only the formatted snapshot', async () => {
    const snapshot = populatedSnapshot();

    const buffer = await createTransferArchive(snapshot);
    const archive = await JSZip.loadAsync(buffer);

    expect(Object.keys(archive.files)).toEqual([TRANSFER_ARCHIVE_ENTRY_NAME]);
    expect(archive.file(TRANSFER_ARCHIVE_ENTRY_NAME)).not.toBeNull();
    await expect(archive.file(TRANSFER_ARCHIVE_ENTRY_NAME)!.async('string')).resolves.toBe(
      `${JSON.stringify(snapshot, null, 2)}\n`,
    );
  });

  it('round-trips embedded book cover and codex images without changing them', async () => {
    const snapshot = populatedSnapshot();

    const restored = await readTransferArchive(await createTransferArchive(snapshot));

    expect(restored).toEqual(snapshot);
    expect((restored as DataExportSnapshot).data.books[0].coverImage).toBe('Y292ZXI=');
    expect((restored as DataExportSnapshot).data.codexEntries[0].image).toBe('cG9ydHJhaXQ=');
  });

  it('round-trips an empty library snapshot', async () => {
    const snapshot = emptyLibrarySnapshot();

    await expect(readTransferArchive(await createTransferArchive(snapshot))).resolves.toEqual(
      snapshot,
    );
  });

  it('rejects unreadable ZIP data', async () => {
    await expect(readTransferArchive(Buffer.from('not a zip'))).rejects.toThrow(
      'Invalid transfer archive: unreadable ZIP data.',
    );
  });

  it.each([
    ['a missing entry', new JSZip()],
    ['a renamed entry', archiveWithFiles({ 'data.json': '{}' })],
    ['a directory-only entry', archiveWithDirectory(TRANSFER_ARCHIVE_ENTRY_NAME)],
    [
      'an extra file',
      archiveWithFiles({ [TRANSFER_ARCHIVE_ENTRY_NAME]: '{}', 'extra.json': '{}' }),
    ],
    [
      'an extra directory',
      archiveWithFilesAndDirectory(
        { [TRANSFER_ARCHIVE_ENTRY_NAME]: '{}' },
        'metadata',
      ),
    ],
  ])('rejects an archive with %s', async (_, archive) => {
    const buffer = await archive.generateAsync({ type: 'nodebuffer' });

    await expect(readTransferArchive(buffer)).rejects.toThrow(
      `Invalid transfer archive: expected exactly one file named "${TRANSFER_ARCHIVE_ENTRY_NAME}".`,
    );
  });

  it('rejects invalid snapshot JSON', async () => {
    const archive = archiveWithFiles({ [TRANSFER_ARCHIVE_ENTRY_NAME]: '{invalid' });
    const buffer = await archive.generateAsync({ type: 'nodebuffer' });

    await expect(readTransferArchive(buffer)).rejects.toThrow(
      `Invalid transfer archive: "${TRANSFER_ARCHIVE_ENTRY_NAME}" is not valid JSON.`,
    );
  });

  it('leaves semantic validation to the transfer archive validator', async () => {
    const semanticallyInvalidSnapshot = { schemaVersion: 999, data: 'invalid' };
    const archive = archiveWithFiles({
      [TRANSFER_ARCHIVE_ENTRY_NAME]: JSON.stringify(semanticallyInvalidSnapshot),
    });
    const buffer = await archive.generateAsync({ type: 'nodebuffer' });

    await expect(readTransferArchive(buffer)).resolves.toEqual(semanticallyInvalidSnapshot);
  });
});

function archiveWithFiles(files: Record<string, string>): JSZip {
  const archive = new JSZip();
  Object.entries(files).forEach(([path, contents]) => archive.file(path, contents));
  return archive;
}

function archiveWithDirectory(path: string): JSZip {
  const archive = new JSZip();
  archive.folder(path);
  return archive;
}

function archiveWithFilesAndDirectory(files: Record<string, string>, directory: string): JSZip {
  const archive = archiveWithFiles(files);
  archive.folder(directory);
  return archive;
}

function populatedSnapshot(): DataExportSnapshot {
  const snapshot = emptyLibrarySnapshot();

  return {
    ...snapshot,
    scope: { type: 'book', bookId: 'book-1' },
    data: {
      ...snapshot.data,
      books: [{
        id: 'book-1',
        title: 'The Test Novel',
        author: 'Test Author',
        status: 'draft',
        synopsis: null,
        language: 'english',
        coverImage: 'Y292ZXI=',
        wordCount: 0,
        createdAt: '2026-08-14T12:00:00.000Z',
        lastEditedAt: '2026-08-14T12:00:00.000Z',
      }],
      codexEntries: [{
        id: 'codex-1',
        bookId: 'book-1',
        name: 'Protagonist',
        type: 'character',
        description: null,
        alias: null,
        image: 'cG9ydHJhaXQ=',
        status: 'active',
        trackingSetting: 'include_when_detected',
        createdAt: '2026-08-14T12:00:00.000Z',
        lastEditedAt: '2026-08-14T12:00:00.000Z',
      }],
    },
  };
}

function emptyLibrarySnapshot(): DataExportSnapshot {
  return {
    schemaVersion: 1,
    exportedAt: '2026-08-14T12:00:00.000Z',
    scope: { type: 'library' },
    data: {
      books: [],
      bookSettings: [],
      categories: [],
      bookTags: [],
      acts: [],
      chapters: [],
      scenes: [],
      codexEntries: [],
      codexEntryNotes: [],
      codexEntryProgression: [],
      chatThreads: [],
      chatMessages: [],
      chatBranchSelections: [],
      systemPromptPresets: [],
      activeSystemPromptPresets: [],
    },
  };
}
