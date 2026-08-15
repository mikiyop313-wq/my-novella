export type SaveDataExportRequest = { type: 'book'; bookId: string } | { type: 'library' };

export type SaveDataExportResult = { status: 'saved'; filePath: string } | { status: 'cancelled' };

export type ImportDataResult =
  | { status: 'imported'; importedBookIds: string[] }
  | { status: 'cancelled' };
