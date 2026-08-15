import { Injectable, computed, inject, signal } from '@angular/core';

import type { UpdateState } from '../../../../shared/models/update.model';
import { ElectronService } from './electron.service';

export type UpdateAction = 'check' | 'download' | 'install';

const INITIAL_UPDATE_STATE: UpdateState = {
  status: 'unavailable',
  currentVersion: '',
  availableVersion: null,
  releaseNotes: null,
  releaseDate: null,
  downloadPercent: null,
  errorMessage: null,
};

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly electronService = inject(ElectronService);
  private readonly manualUpdateFlow = signal(false);
  private receivedStateEvent = false;
  private checkRequestPending = false;
  private downloadRequestPending = false;
  private installRequestPending = false;

  readonly state = signal<UpdateState>(INITIAL_UPDATE_STATE);
  readonly failedAction = signal<UpdateAction | null>(null);
  readonly automaticPromptAllowed = computed(() => !this.manualUpdateFlow());

  constructor() {
    this.electronService.on('update:state-changed', (state: UpdateState) => {
      this.receivedStateEvent = true;
      if (state.status === 'error') {
        this.failedAction.set(this.pendingAction());
      } else {
        this.failedAction.set(null);
      }
      this.state.set(state);
    });
    void this.loadInitialState();
  }

  async checkForUpdates(): Promise<void> {
    if (this.state().status === 'checking') return;

    this.manualUpdateFlow.set(true);
    this.checkRequestPending = true;
    try {
      await this.electronService.invoke('update:check');
    } catch (error) {
      this.setLocalError(error, 'Unable to check for updates.', 'check');
    } finally {
      this.checkRequestPending = false;
    }
  }

  async downloadUpdate(): Promise<void> {
    if (this.downloadRequestPending) return;

    this.downloadRequestPending = true;
    try {
      await this.electronService.invoke('update:download');
    } catch (error) {
      if (this.state().status !== 'error') {
        this.setLocalError(error, 'Unable to download the update.', 'download');
      }
    } finally {
      this.downloadRequestPending = false;
    }
  }

  async installUpdate(): Promise<void> {
    if (this.installRequestPending) return;

    this.installRequestPending = true;
    try {
      await this.electronService.invoke('update:install');
    } catch (error) {
      this.setLocalError(error, 'Unable to restart for the update.', 'install');
      this.installRequestPending = false;
    }
  }

  private async loadInitialState(): Promise<void> {
    try {
      const state = (await this.electronService.invoke('update:get-state')) as UpdateState;
      if (!this.receivedStateEvent) this.state.set(state);
    } catch {
      // Browser development does not expose Electron IPC.
    }
  }

  private pendingAction(): UpdateAction | null {
    if (this.installRequestPending) return 'install';
    if (this.downloadRequestPending) return 'download';
    if (this.checkRequestPending) return 'check';
    return null;
  }

  private setLocalError(error: unknown, fallbackMessage: string, action: UpdateAction): void {
    this.failedAction.set(action);
    this.state.update((state) => ({
      ...state,
      status: 'error',
      downloadPercent: null,
      errorMessage: error instanceof Error ? error.message : fallbackMessage,
    }));
  }
}
