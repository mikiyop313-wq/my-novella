import { writeFile } from 'node:fs/promises';

import { dialog, ipcMain } from 'electron';

import { exportManuscriptToDocx } from '../../domain/manuscript-export/exporters/docx-exporter';
import { exportManuscriptToEpub } from '../../domain/manuscript-export/exporters/epub-exporter';
import { exportManuscriptToPdf } from '../../domain/manuscript-export/exporters/pdf-exporter';
import {
  exportManuscriptToPng,
  renderManuscriptExportContent,
} from '../../domain/manuscript-export/exporters/png-exporter';
import { manuscriptExportService } from '../../domain/manuscript-export/manuscript-export.service';
import type { ManuscriptExportDocument } from '../../domain/manuscript-export/models';
import type {
  ManuscriptExportFormat,
  ManuscriptPngPreviewContentRequest,
  ManuscriptPngPreviewContentResult,
  SaveManuscriptExportRequest,
  SaveManuscriptExportResult,
} from '../../../shared/models/manuscript-export.model';

interface ExportFormatConfiguration {
  extension: ManuscriptExportFormat;
  filterName: string;
  generate: (input: GenerateExportInput) => Promise<Buffer>;
}

interface GenerateExportInput {
  manuscript: ManuscriptExportDocument;
  request: SaveManuscriptExportRequest;
}

const EXPORT_FORMATS: Record<ManuscriptExportFormat, ExportFormatConfiguration> = {
  docx: {
    extension: 'docx',
    filterName: 'Word document',
    generate: ({ manuscript }) => exportManuscriptToDocx(manuscript),
  },
  epub: {
    extension: 'epub',
    filterName: 'EPUB book',
    generate: ({ manuscript }) => exportManuscriptToEpub(manuscript),
  },
  pdf: {
    extension: 'pdf',
    filterName: 'PDF document',
    generate: ({ manuscript }) => exportManuscriptToPdf(manuscript),
  },
  png: {
    extension: 'png',
    filterName: 'PNG image',
    generate: ({ manuscript, request }) => exportManuscriptToPng({
      manuscript,
      options: request.pngOptions,
    }),
  },
};

/** Registers IPC handlers for readable manuscript export operations. */
export function setupManuscriptExportHandlers(): void {
  ipcMain.handle(
    'manuscript-export:preview-content',
    async (
      _,
      request: ManuscriptPngPreviewContentRequest,
    ): Promise<ManuscriptPngPreviewContentResult> => {
      try {
        const manuscript = await manuscriptExportService.prepareExport(request);
        return { html: renderManuscriptExportContent(manuscript) };
      } catch (error) {
        console.error('Failed to prepare PNG manuscript preview content:', error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    'manuscript-export:save',
    async (_, request: SaveManuscriptExportRequest): Promise<SaveManuscriptExportResult> => {
      try {
        const format = getFormatConfiguration(request.format);
        const manuscript = await manuscriptExportService.prepareExport(request);
        const saveResult = await dialog.showSaveDialog({
          title: 'Export manuscript',
          defaultPath: `${sanitizeFileName(manuscript.book.title)}.${format.extension}`,
          filters: [{ name: format.filterName, extensions: [format.extension] }],
        });

        if (saveResult.canceled || !saveResult.filePath) {
          return { status: 'cancelled' };
        }

        const file = await format.generate({ manuscript, request });
        await writeFile(saveResult.filePath, file);

        return { status: 'saved', filePath: saveResult.filePath };
      } catch (error) {
        console.error('Failed to export manuscript:', error);
        throw error;
      }
    },
  );
}

function getFormatConfiguration(format: ManuscriptExportFormat): ExportFormatConfiguration {
  const configuration = EXPORT_FORMATS[format];
  if (!configuration) {
    throw new Error(`Unsupported manuscript export format: ${String(format)}`);
  }

  return configuration;
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
