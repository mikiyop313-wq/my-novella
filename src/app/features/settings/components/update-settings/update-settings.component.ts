import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { AppUpdateService } from '../../../../core/services/app-update.service';

@Component({
  selector: 'app-update-settings',
  imports: [DatePipe],
  templateUrl: './update-settings.component.html',
  styleUrls: ['../../styles/settings.shared.scss', './update-settings.component.scss'],
})
export class UpdateSettingsComponent {
  readonly updateService = inject(AppUpdateService);
  readonly state = this.updateService.state;

  checkForUpdates(): Promise<void> {
    return this.updateService.checkForUpdates();
  }

  downloadUpdate(): Promise<void> {
    return this.updateService.downloadUpdate();
  }

  installUpdate(): Promise<void> {
    return this.updateService.installUpdate();
  }

  retryFailedAction(): Promise<void> {
    if (this.updateService.failedAction() === 'install') return this.installUpdate();
    if (
      this.updateService.failedAction() === 'download' ||
      this.state().availableVersion !== null
    ) {
      return this.downloadUpdate();
    }
    return this.checkForUpdates();
  }

  retryLabel(): string {
    if (this.updateService.failedAction() === 'install') return 'Retry restart';
    if (
      this.updateService.failedAction() === 'download' ||
      this.state().availableVersion !== null
    ) {
      return 'Retry download';
    }
    return 'Check again';
  }
}
