import { Component, inject } from '@angular/core';

import { CodexSidebarSection } from '../../codex/components/codex-sidebar-section/codex-sidebar-section';
import { WorkspaceStore } from '../workspace.store';

@Component({
  selector: 'app-workspace-sidebar',
  imports: [CodexSidebarSection],
  templateUrl: './workspace-sidebar.html',
  styleUrl: './workspace-sidebar.scss',
})
export class WorkspaceSidebar {
  readonly store = inject(WorkspaceStore);
}
