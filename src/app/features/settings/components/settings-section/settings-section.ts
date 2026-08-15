import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { WorkspaceStore } from '../../../../features/workspace/workspace.store';

@Component({
  selector: 'app-settings-section',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './settings-section.html',
  styleUrl: './settings-section.scss',
})
export class SettingsSection {
  readonly store = inject(WorkspaceStore);
  readonly settingsRoute = computed(() => {
    const bookId = this.store.bookId();
    return bookId ? ['/workspace', bookId, 'settings'] : null;
  });
}
