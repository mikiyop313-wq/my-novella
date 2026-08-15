import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ManuscriptExportDocument } from '../../../domain/manuscript-export/models';
import type {
  ManuscriptExportFormat,
  SaveManuscriptExportRequest,
} from '../../../../shared/models/manuscript-export.model';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  showSaveDialog: vi.fn(),
  writeFile: vi.fn(),
  prepareExport: vi.fn(),
  exportDocx: vi.fn(),
  exportEpub: vi.fn(),
  exportPdf: vi.fn(),
  exportPng: vi.fn(),
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

vi.mock('../../../domain/manuscript-export/manuscript-export.service', () => ({
  manuscriptExportService: { prepareExport: mocks.prepareExport },
}));

vi.mock('../../../domain/manuscript-export/exporters/docx-exporter', () => ({
  exportManuscriptToDocx: mocks.exportDocx,
}));

vi.mock('../../../domain/manuscript-export/exporters/epub-exporter', () => ({
  exportManuscriptToEpub: mocks.exportEpub,
}));

vi.mock('../../../domain/manuscript-export/exporters/pdf-exporter', () => ({
  exportManuscriptToPdf: mocks.exportPdf,
}));

vi.mock('../../../domain/manuscript-export/exporters/png-exporter', () => ({
  exportManuscriptToPng: mocks.exportPng,
}));

import { setupManuscriptExportHandlers } from '../manuscript-export';

const manuscript = {
  target: { mode: 'book', id: 'book-1' },
  book: {
    id: 'book-1',
    title: 'A/B:C*D?',
    author: 'Author',
    language: 'english',
  },
  nodes: [],
} satisfies ManuscriptExportDocument;

const exporters: Record<ManuscriptExportFormat, ReturnType<typeof vi.fn>> = {
  docx: mocks.exportDocx,
  epub: mocks.exportEpub,
  pdf: mocks.exportPdf,
  png: mocks.exportPng,
};

const formatCases = [
  ['docx', 'Word document'],
  ['epub', 'EPUB book'],
  ['pdf', 'PDF document'],
  ['png', 'PNG image'],
] as const;

describe('manuscript export IPC handler', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    mocks.prepareExport.mockResolvedValue(manuscript);
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:\\Exports\\novel' });
    mocks.writeFile.mockResolvedValue(undefined);
    Object.values(exporters).forEach((exporter) => {
      exporter.mockResolvedValue(Buffer.from('exported manuscript'));
    });
    setupManuscriptExportHandlers();
  });

  it('registers the save handler', () => {
    expect(mocks.handlers.has('manuscript-export:save')).toBe(true);
  });

  it.each(formatCases)('saves a %s export with the matching exporter and dialog filter', async (
    format,
    filterName,
  ) => {
    const request: SaveManuscriptExportRequest = { mode: 'book', id: 'book-1', format };
    const filePath = `C:\\Exports\\novel.${format}`;
    const file = Buffer.from(`${format} manuscript`);
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath });
    exporters[format].mockResolvedValue(file);

    const result = await invokeHandler(request);

    expect(mocks.prepareExport).toHaveBeenCalledWith(request);
    expect(mocks.showSaveDialog).toHaveBeenCalledWith({
      title: 'Export manuscript',
      defaultPath: `A_B_C_D_.${format}`,
      filters: [{ name: filterName, extensions: [format] }],
    });
    expect(exporters[format]).toHaveBeenCalledWith(manuscript);
    Object.entries(exporters)
      .filter(([exportFormat]) => exportFormat !== format)
      .forEach(([, exporter]) => expect(exporter).not.toHaveBeenCalled());
    expect(mocks.writeFile).toHaveBeenCalledWith(filePath, file);
    expect(result).toEqual({ status: 'saved', filePath });
  });

  it('returns cancelled without generating or writing a file', async () => {
    mocks.showSaveDialog.mockResolvedValue({ canceled: true });

    const result = await invokeHandler({ mode: 'chapter', id: 'chapter-1', format: 'pdf' });

    expect(mocks.prepareExport).toHaveBeenCalledWith({
      mode: 'chapter',
      id: 'chapter-1',
      format: 'pdf',
    });
    Object.values(exporters).forEach((exporter) => expect(exporter).not.toHaveBeenCalled());
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'cancelled' });
  });

  it('rejects unsupported runtime formats before preparing the manuscript', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(invokeHandler({
      mode: 'book',
      id: 'book-1',
      format: 'html' as ManuscriptExportFormat,
    })).rejects.toThrow('Unsupported manuscript export format: html');

    expect(mocks.prepareExport).not.toHaveBeenCalled();
    expect(mocks.showSaveDialog).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    ['preparation', () => mocks.prepareExport.mockRejectedValue(new Error('prepare failed'))],
    ['save dialog', () => mocks.showSaveDialog.mockRejectedValue(new Error('dialog failed'))],
    ['generation', () => mocks.exportDocx.mockRejectedValue(new Error('generate failed'))],
    ['file write', () => mocks.writeFile.mockRejectedValue(new Error('write failed'))],
  ])('propagates %s failures', async (_, arrangeFailure) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    arrangeFailure();

    await expect(invokeHandler({ mode: 'book', id: 'book-1', format: 'docx' })).rejects.toThrow(
      'failed',
    );

    consoleError.mockRestore();
  });
});

async function invokeHandler(request: SaveManuscriptExportRequest): Promise<unknown> {
  const handler = mocks.handlers.get('manuscript-export:save');
  if (!handler) {
    throw new Error('Manuscript export IPC handler was not registered.');
  }

  return await handler({}, request);
}
