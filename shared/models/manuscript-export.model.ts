import type { ManuscriptMode } from './manuscript.model';

export type ManuscriptExportFormat = 'docx' | 'epub' | 'pdf' | 'png';

export type ManuscriptPngExportTheme = 'light' | 'dark';

export interface ManuscriptPngExportOptions {
  fontSize?: number;
  theme?: ManuscriptPngExportTheme;
  width?: number;
}

export const MANUSCRIPT_PNG_EXPORT_SCALE = 2;

export const MANUSCRIPT_PNG_EXPORT_DEFAULTS: Required<ManuscriptPngExportOptions> = {
  fontSize: 16,
  theme: 'dark',
  width: 700,
};

export const MANUSCRIPT_PNG_EXPORT_LIMITS = {
  fontSize: { minimum: 8, maximum: 24 },
  width: { minimum: 320, maximum: 4096 },
} as const;

export const MANUSCRIPT_PNG_EXPORT_THEME_COLORS = {
  light: {
    background: '#fafafa',
    text: '#171717',
    surface: '#ffffff',
    secondaryText: '#737373',
    border: 'rgba(0, 0, 0, 0.08)',
  },
  dark: {
    background: '#121212',
    text: '#fdf8f5',
    surface: '#202020',
    secondaryText: '#bbaaaa',
    border: 'rgba(255, 255, 255, 0.08)',
  },
} as const satisfies Record<ManuscriptPngExportTheme, Record<string, string>>;

export interface ManuscriptPngPreviewContentRequest {
  mode: ManuscriptMode;
  id: string;
}

export interface ManuscriptPngPreviewContentResult {
  html: string;
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
