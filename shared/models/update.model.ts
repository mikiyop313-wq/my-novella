export type UpdateStatus =
  | 'unavailable'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  downloadPercent: number | null;
  errorMessage: string | null;
}
