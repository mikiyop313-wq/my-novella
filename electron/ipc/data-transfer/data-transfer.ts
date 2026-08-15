import { writeFile } from 'node:fs/promises';

import { dialog, ipcMain } from 'electron';

import { dataExportService } from '../../domain/data-transfer/data-export.service';
import type { DataExportSnapshot } from '../../domain/data-transfer/models';
import { createTransferArchive } from '../../domain/data-transfer/transfer-archive';
import type {
  SaveDataExportRequest,
  SaveDataExportResult,
} from '../../../shared/models/data-transfer.model';

const ARCHIVE_EXTENSION = 'novella';
const LIBRARY_ARCHIVE_FILE_NAME = `my-novella-library.${ARCHIVE_EXTENSION}`;

interface PreparedDataExport {
  snapshot: DataExportSnapshot;
  defaultFileName: string;
}

/** Registers IPC handlers for portable book and library transfer operations. */
export function setupDataTransferHandlers(): void {
  ipcMain.handle(
    'data-transfer:export',
    async (_, request: SaveDataExportRequest): Promise<SaveDataExportResult> => {
      try {
        const preparedExport = await prepareDataExport(request);
        const saveResult = await dialog.showSaveDialog({
          title: 'Export data',
          defaultPath: preparedExport.defaultFileName,
          filters: [{ name: 'My Novella archive', extensions: [ARCHIVE_EXTENSION] }],
        });

        if (saveResult.canceled || !saveResult.filePath) {
          return { status: 'cancelled' };
        }

        const archive = await createTransferArchive(preparedExport.snapshot);
        await writeFile(saveResult.filePath, archive);

        return { status: 'saved', filePath: saveResult.filePath };
      } catch (error) {
        console.error('Failed to export data:', error);
        throw error;
      }
    },
  );
}

async function prepareDataExport(request: SaveDataExportRequest): Promise<PreparedDataExport> {
  if (request?.type === 'book') {
    const snapshot = await dataExportService.createBookExport(request.bookId);
    return {
      snapshot,
      defaultFileName: `${sanitizeFileName(snapshot.data.books[0].title)}.${ARCHIVE_EXTENSION}`,
    };
  }

  if (request?.type === 'library') {
    return {
      snapshot: await dataExportService.createLibraryExport(),
      defaultFileName: LIBRARY_ARCHIVE_FILE_NAME,
    };
  }

  const unsupportedType = (request as { type?: unknown } | null | undefined)?.type;
  throw new Error(`Unsupported data export type: ${String(unsupportedType)}.`);
}

function sanitizeFileName(title: string): string {
  const sanitizedTitle = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/[. ]+$/g, '');

  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(sanitizedTitle)
    ? `${sanitizedTitle}_`
    : sanitizedTitle;
}
