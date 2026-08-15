export type SaveDataExportRequest = { type: 'book'; bookId: string } | { type: 'library' };

export type SaveDataExportResult = { status: 'saved'; filePath: string } | { status: 'cancelled' };
