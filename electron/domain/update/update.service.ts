import type { AppUpdater, ProgressInfo, UpdateInfo } from 'electron-updater';

import type { UpdateState } from '../../../shared/models/update.model';

interface UpdateServiceOptions {
  updater: AppUpdater;
  isPackaged: boolean;
  isPortable: boolean;
  currentVersion: string;
  broadcast: (state: UpdateState) => void;
}

export class UpdateService {
  private readonly updater: AppUpdater;
  private readonly updatesEnabled: boolean;
  private readonly broadcast: (state: UpdateState) => void;
  private initialized = false;
  private startupCheckStarted = false;
  private state: UpdateState;

  constructor(options: UpdateServiceOptions) {
    this.updater = options.updater;
    this.updatesEnabled = options.isPackaged && !options.isPortable;
    this.broadcast = options.broadcast;
    this.state = {
      status: options.isPortable ? 'portable' : options.isPackaged ? 'idle' : 'unavailable',
      currentVersion: options.currentVersion,
      availableVersion: null,
      releaseNotes: null,
      releaseDate: null,
      downloadPercent: null,
      errorMessage: null,
    };
  }

  initialize(): void {
    if (this.initialized || !this.updatesEnabled) return;

    this.initialized = true;
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = true;
    this.updater.allowPrerelease = false;
    this.updater.fullChangelog = false;

    this.updater.on('checking-for-update', () => {
      this.setState({
        status: 'checking',
        availableVersion: null,
        releaseNotes: null,
        releaseDate: null,
        downloadPercent: null,
        errorMessage: null,
      });
    });
    this.updater.on('update-not-available', () => {
      this.setState({
        status: 'up-to-date',
        availableVersion: null,
        releaseNotes: null,
        releaseDate: null,
        downloadPercent: null,
        errorMessage: null,
      });
    });
    this.updater.on('update-available', (info) => this.handleAvailableUpdate(info));
    this.updater.on('download-progress', (progress) => this.handleDownloadProgress(progress));
    this.updater.on('update-downloaded', (info) => {
      this.setState({
        status: 'downloaded',
        availableVersion: info.version,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        releaseDate: info.releaseDate ?? null,
        downloadPercent: 100,
        errorMessage: null,
      });
    });
    this.updater.on('error', (error) => this.handleError(error));
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  async checkForUpdatesAtStartup(): Promise<void> {
    if (this.startupCheckStarted || !this.updatesEnabled) return;

    this.startupCheckStarted = true;
    await this.checkForUpdates();
  }

  async checkForUpdates(): Promise<void> {
    if (!this.updatesEnabled) return;

    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      this.handleError(error);
    }
  }

  async downloadUpdate(): Promise<void> {
    const canDownload =
      this.state.status === 'available' ||
      (this.state.status === 'error' && this.state.availableVersion !== null);
    if (!canDownload) {
      throw new Error('No update is available to download.');
    }

    this.setState({ status: 'downloading', downloadPercent: 0, errorMessage: null });
    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  assertReadyToInstall(): void {
    if (this.state.status !== 'downloaded') {
      throw new Error('The update has not finished downloading.');
    }
  }

  quitAndInstall(): boolean {
    if (this.state.status !== 'downloaded') {
      this.handleError(new Error('The update has not finished downloading.'));
      return false;
    }

    try {
      this.updater.quitAndInstall(false, true);
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  private handleAvailableUpdate(info: UpdateInfo): void {
    this.setState({
      status: 'available',
      availableVersion: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate ?? null,
      downloadPercent: null,
      errorMessage: null,
    });
  }

  private handleDownloadProgress(progress: ProgressInfo): void {
    this.setState({
      status: 'downloading',
      downloadPercent: clampPercent(progress.percent),
      errorMessage: null,
    });
  }

  private handleError(error: unknown): void {
    this.setState({
      status: 'error',
      downloadPercent: null,
      errorMessage: error instanceof Error ? error.message : 'Unable to update the application.',
    });
  }

  private setState(update: Partial<UpdateState>): void {
    this.state = { ...this.state, ...update };
    this.broadcast(this.getState());
  }
}

export function normalizeReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']): string | null {
  if (typeof releaseNotes === 'string') {
    return releaseNotes.trim() || null;
  }
  if (!Array.isArray(releaseNotes)) return null;

  const notes = releaseNotes
    .map((releaseNote) => {
      const note = releaseNote.note?.trim();
      if (!note) return null;
      return releaseNote.version ? `${releaseNote.version}\n${note}` : note;
    })
    .filter((note): note is string => note !== null);
  return notes.length > 0 ? notes.join('\n\n') : null;
}

function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, Math.round(percent)));
}
