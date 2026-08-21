import { Component, inject, signal } from '@angular/core';

import { CodexSidebarSection } from '../../codex/components/codex-sidebar-section/codex-sidebar-section';
import { GeneralNotesSidebarSection } from '../../notes/components/general-notes-sidebar-section/general-notes-sidebar-section';
import { WorkspaceStore } from '../workspace.store';

type ReferenceSection = 'codex' | 'notes';

@Component({
  selector: 'app-workspace-sidebar',
  imports: [CodexSidebarSection, GeneralNotesSidebarSection],
  templateUrl: './workspace-sidebar.html',
  styleUrl: './workspace-sidebar.scss',
})
export class WorkspaceSidebar {
  readonly store = inject(WorkspaceStore);
  readonly activeSection = signal<ReferenceSection>('codex');

  selectSection(section: ReferenceSection): void {
    this.activeSection.set(section);
  }
}
