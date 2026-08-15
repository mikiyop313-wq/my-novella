import { Component, inject } from '@angular/core';

import { WorkspaceStore } from '../../../../features/workspace/workspace.store';

@Component({
  selector: 'app-settings-section',
  templateUrl: './settings-section.html',
  styleUrl: './settings-section.scss',
})
export class SettingsSection {
  readonly store = inject(WorkspaceStore);

  openSettings(): void {
    // To be implemented
  }
}
