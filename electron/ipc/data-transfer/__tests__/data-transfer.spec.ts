import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataExportSnapshot } from '../../../domain/data-transfer/models';
import type { SaveDataExportRequest } from '../../../../shared/models/data-transfer.model';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  showSaveDialog: vi.fn(),
  writeFile: vi.fn(),
  createBookExport: vi.fn(),
  createLibraryExport: vi.fn(),
  createTransferArchive: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: { showSaveDialog: mocks.showSaveDialog },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('node:fs/promises', () => ({ writeFile: mocks.writeFile }));

vi.mock('../../../domain/data-transfer/data-export.service', () => ({
  dataExportService: {
    createBookExport: mocks.createBookExport,
    createLibraryExport: mocks.createLibraryExport,
  },
}));

vi.mock('../../../domain/data-transfer/transfer-archive', () => ({
  createTransferArchive: mocks.createTransferArchive,
}));

import { setupDataTransferHandlers } from '../data-transfer';

describe('data transfer IPC handler', () => {
  const librarySnapshot = createSnapshot();
  const archive = Buffer.from('portable archive');

  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    mocks.createBookExport.mockResolvedValue(createSnapshot('The Novel'));
    mocks.createLibraryExport.mockResolvedValue(librarySnapshot);
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: 'C:\\Exports\\backup.novella',
    });
    mocks.createTransferArchive.mockResolvedValue(archive);
    mocks.writeFile.mockResolvedValue(undefined);
    setupDataTransferHandlers();
  });

  it('registers the export handler', () => {
    expect(mocks.handlers.has('data-transfer:export')).toBe(true);
  });

  it('exports one book to a branded archive', async () => {
    const snapshot = createSnapshot('A/B:C*D?');
    mocks.createBookExport.mockResolvedValue(snapshot);

    const result = await invokeHandler({ type: 'book', bookId: 'book-1' });

    expect(mocks.createBookExport).toHaveBeenCalledWith('book-1');
    expect(mocks.createLibraryExport).not.toHaveBeenCalled();
    expect(mocks.showSaveDialog).toHaveBeenCalledWith({
      title: 'Export data',
      defaultPath: 'A_B_C_D_.novella',
      filters: [{ name: 'My Novella archive', extensions: ['novella'] }],
    });
    expect(mocks.createTransferArchive).toHaveBeenCalledWith(snapshot);
    expect(mocks.writeFile).toHaveBeenCalledWith('C:\\Exports\\backup.novella', archive);
    expect(result).toEqual({
      status: 'saved',
      filePath: 'C:\\Exports\\backup.novella',
    });
  });

  it('exports the complete library with the library filename', async () => {
    const result = await invokeHandler({ type: 'library' });

    expect(mocks.createLibraryExport).toHaveBeenCalledOnce();
    expect(mocks.createBookExport).not.toHaveBeenCalled();
    expect(mocks.showSaveDialog).toHaveBeenCalledWith({
      title: 'Export data',
      defaultPath: 'my-novella-library.novella',
      filters: [{ name: 'My Novella archive', extensions: ['novella'] }],
    });
    expect(mocks.createTransferArchive).toHaveBeenCalledWith(librarySnapshot);
    expect(result).toEqual({
      status: 'saved',
      filePath: 'C:\\Exports\\backup.novella',
    });
  });

  it.each([
    ['CON', 'CON_.novella'],
    ['lpt1', 'lpt1_.novella'],
    ['Title. ', 'Title.novella'],
  ])('sanitizes the book filename %s', async (title, expectedFileName) => {
    mocks.createBookExport.mockResolvedValue(createSnapshot(title));

    await invokeHandler({ type: 'book', bookId: 'book-1' });

    expect(mocks.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expectedFileName,
      }),
    );
  });

  it('returns cancelled without creating or writing the archive', async () => {
    mocks.showSaveDialog.mockResolvedValue({ canceled: true });

    const result = await invokeHandler({ type: 'library' });

    expect(mocks.createLibraryExport).toHaveBeenCalledOnce();
    expect(mocks.createTransferArchive).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'cancelled' });
  });

  it('rejects unsupported runtime export types before using a service', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      invokeHandler({ type: 'workspace' } as unknown as SaveDataExportRequest),
    ).rejects.toThrow('Unsupported data export type: workspace.');

    expect(mocks.createBookExport).not.toHaveBeenCalled();
    expect(mocks.createLibraryExport).not.toHaveBeenCalled();
    expect(mocks.showSaveDialog).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    [
      'snapshot creation',
      () => mocks.createLibraryExport.mockRejectedValue(new Error('snapshot failed')),
    ],
    ['save dialog', () => mocks.showSaveDialog.mockRejectedValue(new Error('dialog failed'))],
    [
      'archive creation',
      () => mocks.createTransferArchive.mockRejectedValue(new Error('archive failed')),
    ],
    ['file write', () => mocks.writeFile.mockRejectedValue(new Error('write failed'))],
  ])('propagates %s failures', async (_, arrangeFailure) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    arrangeFailure();

    await expect(invokeHandler({ type: 'library' })).rejects.toThrow('failed');

    consoleError.mockRestore();
  });
});

async function invokeHandler(request: SaveDataExportRequest): Promise<unknown> {
  const handler = mocks.handlers.get('data-transfer:export');
  if (!handler) {
    throw new Error('Data transfer IPC handler was not registered.');
  }

  return await handler({}, request);
}

function createSnapshot(bookTitle?: string): DataExportSnapshot {
  return {
    schemaVersion: 1,
    exportedAt: '2026-08-14T00:00:00.000Z',
    scope: bookTitle ? { type: 'book', bookId: 'book-1' } : { type: 'library' },
    data: {
      books: bookTitle ? [{ id: 'book-1', title: bookTitle }] : [],
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
  } as DataExportSnapshot;
}
