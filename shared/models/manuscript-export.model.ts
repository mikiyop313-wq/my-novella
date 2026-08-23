import type { ManuscriptMode } from './manuscript.model';

export type ManuscriptExportFormat = 'docx' | 'epub' | 'pdf' | 'png';

export type ManuscriptPngExportTheme = 'light' | 'dark';

export interface ManuscriptPngExportOptions {
  fontSize?: number;
  theme?: ManuscriptPngExportTheme;
  width?: number;
}

export interface SaveManuscriptExportRequest {
  mode: ManuscriptMode;
  id: string;
  format: ManuscriptExportFormat;
  pngOptions?: ManuscriptPngExportOptions;
}

export type SaveManuscriptExportResult =
  | { status: 'saved'; filePath: string }
  | { status: 'cancelled' };
