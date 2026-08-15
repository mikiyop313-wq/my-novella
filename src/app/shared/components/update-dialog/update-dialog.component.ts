import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';

import type { UpdateState } from '../../../../../shared/models/update.model';
import { ElectronService } from '../../../core/services/electron.service';

const INITIAL_UPDATE_STATE: UpdateState = {
  status: 'unavailable',
  currentVersion: '',
  availableVersion: null,
  releaseNotes: null,
  releaseDate: null,
  downloadPercent: null,
  errorMessage: null,
};

@Component({
  selector: 'app-update-dialog',
  templateUrl: './update-dialog.component.html',
  styleUrl: './update-dialog.component.scss',
})
export class UpdateDialogComponent implements OnInit, OnDestroy {
  private readonly electronService = inject(ElectronService);
  private removeStateListener: () => void = () => undefined;
  private installTimer: ReturnType<typeof setTimeout> | null = null;
  private hasShown = false;
  private accepted = false;
  private downloadRequestPending = false;
  private installRequested = false;

  readonly state = signal<UpdateState>(INITIAL_UPDATE_STATE);
  readonly visible = signal(false);

  ngOnInit(): void {
    this.removeStateListener = this.electronService.on(
      'update:state-changed',
      (state: UpdateState) => this.applyState(state),
    );
    void this.loadInitialState();
  }

  ngOnDestroy(): void {
    this.removeStateListener();
    if (this.installTimer !== null) clearTimeout(this.installTimer);
  }

  async acceptUpdate(): Promise<void> {
    if (this.state().status !== 'available') return;

    this.accepted = true;
    await this.downloadUpdate();
  }

  async retryDownload(): Promise<void> {
    if (this.state().status !== 'error' || !this.state().availableVersion) return;

    this.accepted = true;
    await this.downloadUpdate();
  }

  dismiss(): void {
    if (this.isBusy()) return;

    this.visible.set(false);
  }

  onBackdropClick(): void {
    this.dismiss();
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }

  isBusy(): boolean {
    return this.state().status === 'downloading' || this.state().status === 'downloaded';
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.visible() || this.isBusy()) return;

    event.preventDefault();
    this.dismiss();
  }

  private async loadInitialState(): Promise<void> {
    try {
      const state = (await this.electronService.invoke('update:get-state')) as UpdateState;
      this.applyState(state);
    } catch {
      // Browser development does not expose Electron IPC.
    }
  }

  private applyState(state: UpdateState): void {
    this.state.set(state);
    if (state.status === 'available' && !this.hasShown) {
      this.hasShown = true;
      this.visible.set(true);
    }
    if (state.status === 'downloaded' && this.accepted && !this.installRequested) {
      this.scheduleInstall();
    }
  }

  private async downloadUpdate(): Promise<void> {
    if (this.downloadRequestPending) return;

    this.downloadRequestPending = true;
    try {
      await this.electronService.invoke('update:download');
    } catch (error) {
      if (this.state().status !== 'error') {
        this.state.update((state) => ({
          ...state,
          status: 'error',
          downloadPercent: null,
          errorMessage: error instanceof Error ? error.message : 'Unable to download the update.',
        }));
      }
    } finally {
      this.downloadRequestPending = false;
    }
  }

  private scheduleInstall(): void {
    this.installRequested = true;
    this.installTimer = setTimeout(() => {
      this.installTimer = null;
      void this.installUpdate();
    });
  }

  private async installUpdate(): Promise<void> {
    try {
      await this.electronService.invoke('update:install');
    } catch (error) {
      this.installRequested = false;
      this.state.update((state) => ({
        ...state,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unable to restart for the update.',
      }));
    }
  }
}
