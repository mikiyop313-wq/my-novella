import { Component, HostListener, OnDestroy, effect, inject, signal } from '@angular/core';
import { MarkdownComponent } from 'ngx-markdown';

import { AppUpdateService } from '../../../core/services/app-update.service';

@Component({
  selector: 'app-update-dialog',
  imports: [MarkdownComponent],
  templateUrl: './update-dialog.component.html',
  styleUrl: './update-dialog.component.scss',
})
export class UpdateDialogComponent implements OnDestroy {
  private readonly updateService = inject(AppUpdateService);
  private installTimer: ReturnType<typeof setTimeout> | null = null;
  private hasShown = false;
  private accepted = false;
  private installRequested = false;

  readonly state = this.updateService.state;
  readonly visible = signal(false);

  constructor() {
    effect(() => {
      const state = this.state();
      if (
        state.status === 'available' &&
        this.updateService.automaticPromptAllowed() &&
        !this.hasShown
      ) {
        this.hasShown = true;
        this.visible.set(true);
      }
      if (state.status === 'downloaded' && this.accepted && !this.installRequested) {
        this.scheduleInstall();
      }
    });
  }

  ngOnDestroy(): void {
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

  private async downloadUpdate(): Promise<void> {
    await this.updateService.downloadUpdate();
  }

  private scheduleInstall(): void {
    this.installRequested = true;
    this.installTimer = setTimeout(() => {
      this.installTimer = null;
      void this.installUpdate();
    });
  }

  private async installUpdate(): Promise<void> {
    await this.updateService.installUpdate();
    if (this.state().status === 'error') this.installRequested = false;
  }
}
