import type { ManuscriptMode } from './manuscript.model';

export type ManuscriptExportFormat = 'docx' | 'epub' | 'pdf' | 'png';

export interface SaveManuscriptExportRequest {
  mode: ManuscriptMode;
  id: string;
  format: ManuscriptExportFormat;
}

export type SaveManuscriptExportResult =
  | { status: 'saved'; filePath: string }
  | { status: 'cancelled' };
