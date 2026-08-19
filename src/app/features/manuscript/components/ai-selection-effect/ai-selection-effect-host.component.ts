import {
  AfterViewInit,
  Component,
  ComponentRef,
  ViewChild,
  ViewContainerRef,
  effect,
  inject,
  signal,
} from '@angular/core';

import { WorkspaceStore } from '../../../workspace/workspace.store';
import {
  AiSelectionEditService,
  type AiSelectionEditRequest,
} from '../../helpers/ai/ai-selection-edit.service';
import { ManuscriptStore } from '../../store/manuscript.store';
import { AiSelectionEffectComponent } from './ai-selection-effect.component';

@Component({
  selector: 'app-ai-selection-effect-host',
  standalone: true,
  template: '<ng-template #effectContainer />',
})
export class AiSelectionEffectHostComponent implements AfterViewInit {
  @ViewChild('effectContainer', { read: ViewContainerRef, static: true })
  private effectContainer!: ViewContainerRef;

  readonly activeEditCount = signal(0);

  private readonly store = inject(ManuscriptStore);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly selectionEdits = inject(AiSelectionEditService);
  private readonly viewReady = signal(false);
  private readonly effects = new Map<string, ComponentRef<AiSelectionEffectComponent>>();

  constructor() {
    effect(() => {
      const isViewReady = this.viewReady();
      const sessions = this.selectionEdits.sessions();
      const editor = this.store.editor();
      if (!isViewReady) return;

      const visibleIds = new Set(
        sessions
          .filter(session => session.attachedEditor === editor)
          .map(session => session.id),
      );
      for (const [id, component] of this.effects) {
        if (!visibleIds.has(id)) {
          component.destroy();
          this.effects.delete(id);
        }
      }
      for (const id of visibleIds) {
        if (!this.effects.has(id)) {
          const component = this.effectContainer.createComponent(AiSelectionEffectComponent);
          component.setInput('sessionId', id);
          component.changeDetectorRef.detectChanges();
          this.effects.set(id, component);
        }
      }
      this.activeEditCount.set(this.effects.size);
    });
  }

  ngAfterViewInit(): void {
    this.viewReady.set(true);
  }

  startEdit(request: AiSelectionEditRequest): boolean {
    const editor = this.store.editor();
    const bookId = this.workspaceStore.bookId();
    if (!editor || !bookId) return false;

    return this.selectionEdits.startEdit({
      editor,
      bookId,
      bookTitle: this.workspaceStore.bookTitle(),
      request,
    }) !== null;
  }

  hasActiveEdits(): boolean {
    return this.activeEditCount() > 0;
  }

  focusSession(sessionId: string): boolean {
    return this.effects.get(sessionId)?.instance.focusSession(sessionId) ?? false;
  }
}
