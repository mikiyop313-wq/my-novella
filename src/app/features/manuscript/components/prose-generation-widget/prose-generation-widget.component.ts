import { Component, computed, effect, inject, output, signal, untracked } from '@angular/core';

import { AiGenerationSessionService } from '../../../../core/services/ai-generation-session.service';
import { WorkspaceStore } from '../../../workspace/workspace.store';
import type { ActDto } from '../../../../../../shared/models/manuscript.model';
import { AiSelectionEditService } from '../../helpers/ai/ai-selection-edit.service';
import { ManuscriptStore } from '../../store/manuscript.store';

export type ProseGenerationFocusRequest =
  | { target: 'prose-block'; blockId: string; sceneId: string }
  | { target: 'selection-edit'; sessionId: string; sceneId: string };

type ProseGenerationItem = ProseGenerationFocusRequest & {
  id: string;
  activityLabel: string;
  breadcrumb: string;
  wordCount: number;
  isComplete: boolean;
};

interface TrackedProseGeneration {
  bookId: string;
  item: ProseGenerationItem;
}

@Component({
  selector: 'app-prose-generation-widget',
  standalone: true,
  templateUrl: './prose-generation-widget.component.html',
  styleUrl: './prose-generation-widget.component.scss',
})
export class ProseGenerationWidgetComponent {
  private readonly generationSessions = inject(AiGenerationSessionService);
  private readonly selectionEdits = inject(AiSelectionEditService);
  private readonly manuscriptStore = inject(ManuscriptStore);
  private readonly workspaceStore = inject(WorkspaceStore);

  readonly focusRequested = output<ProseGenerationFocusRequest>();

  private readonly selectedSessionId = signal<string | null>(null);
  private readonly trackedProseGenerations = signal<readonly TrackedProseGeneration[]>([]);
  private readonly dismissedGenerationIds = signal<ReadonlySet<string>>(new Set());
  private previousSessionIds: string[] = [];
  private trackedBookId: string | null = null;

  readonly generations = computed<ProseGenerationItem[]>(() => {
    const hierarchy = this.manuscriptStore.bookHierarchy();
    const bookId = this.workspaceStore.bookId();
    const dismissedIds = this.dismissedGenerationIds();
    const items = this.trackedProseGenerations()
      .filter(generation => generation.bookId === bookId)
      .map(generation => generation.item);

    if (bookId) {
      for (const edit of this.selectionEdits.sessionsForBook(bookId)) {
        if (!dismissedIds.has(edit.id)) {
          const location = this.resolveScene(edit.sceneId, hierarchy);
          if (location) {
            const isComplete = edit.state() === 'ready';
            items.push({
              target: 'selection-edit',
              id: edit.id,
              sessionId: edit.id,
              sceneId: edit.sceneId,
              activityLabel: isComplete
                ? `Review ${edit.request.actionLabel.toLowerCase()}`
                : edit.activityLabel,
              breadcrumb: location,
              wordCount: this.countWords(edit.generatedContent()),
              isComplete,
            });
          }
        }
      }
    }

    return items;
  });

  readonly selectedIndex = computed(() => {
    const sessionId = this.selectedSessionId();
    const index = this.generations().findIndex(item => item.id === sessionId);
    return index === -1 ? 0 : index;
  });
  readonly selectedGeneration = computed(() => this.generations()[this.selectedIndex()] ?? null);
  readonly hasMultipleGenerations = computed(() => this.generations().length > 1);
  readonly canSelectPrevious = computed(() => this.selectedIndex() > 0);
  readonly canSelectNext = computed(() => this.selectedIndex() < this.generations().length - 1);

  constructor() {
    effect(() => {
      const bookId = this.workspaceStore.bookId();
      const hierarchy = this.manuscriptStore.bookHierarchy();
      const sessions = this.generationSessions.sessions();

      if (bookId !== this.trackedBookId) {
        this.trackedBookId = bookId;
        this.trackedProseGenerations.set([]);
        this.dismissedGenerationIds.set(new Set());
        this.previousSessionIds = [];
      }

      if (!bookId) return;

      const dismissedIds = new Set(untracked(() => this.dismissedGenerationIds()));
      const visibleSessionIds = new Set<string>();
      const nextGenerations = [...untracked(() => this.trackedProseGenerations())];

      for (const session of sessions) {
        const isRelevantProseSession = !(
          session.source !== 'manuscript-prose'
          || session.bookId !== bookId
          || !session.scopeId
        );
        if (isRelevantProseSession && session.scopeId) {
          visibleSessionIds.add(session.id);
          const status = session.status();
          if (status === 'stopped' || status === 'failed') {
            this.removeTrackedGeneration(nextGenerations, session.id);
          } else {
            const location = this.resolveScene(session.scopeId, hierarchy);
            if (!location) {
              this.removeTrackedGeneration(nextGenerations, session.id);
            } else {
              const isComplete = status === 'complete';
              if (!isComplete) dismissedIds.delete(session.id);
              if (dismissedIds.has(session.id)) {
                this.removeTrackedGeneration(nextGenerations, session.id);
              } else {
                const item: ProseGenerationItem = {
                  target: 'prose-block',
                  id: session.id,
                  blockId: session.id,
                  sceneId: session.scopeId,
                  activityLabel: session.activityLabel ?? 'Generating prose',
                  breadcrumb: location,
                  wordCount: this.countWords(session.content()),
                  isComplete,
                };
                const existingIndex = nextGenerations.findIndex(
                  generation => generation.item.id === item.id,
                );
                if (existingIndex === -1) {
                  nextGenerations.push({ bookId, item });
                } else {
                  nextGenerations[existingIndex] = { bookId, item };
                }
              }
            }
          }
        }
      }

      const retainedGenerations = nextGenerations.filter(generation => (
        generation.item.isComplete || visibleSessionIds.has(generation.item.id)
      ));
      this.dismissedGenerationIds.set(dismissedIds);
      this.trackedProseGenerations.set(retainedGenerations);
    });

    effect(() => {
      const ids = this.generations().map(item => item.id);
      const selectedId = this.selectedSessionId();
      const newestId = [...ids].reverse().find(id => !this.previousSessionIds.includes(id));

      if (newestId) {
        this.selectedSessionId.set(newestId);
      } else if (!selectedId || !ids.includes(selectedId)) {
        const previousIndex = Math.max(0, this.previousSessionIds.indexOf(selectedId ?? ''));
        this.selectedSessionId.set(ids[Math.min(previousIndex, ids.length - 1)] ?? null);
      }
      this.previousSessionIds = ids;
    });
  }

  requestFocus(): void {
    const generation = this.selectedGeneration();
    if (!generation) return;

    if (generation.target === 'prose-block') {
      this.focusRequested.emit({
        target: generation.target,
        blockId: generation.blockId,
        sceneId: generation.sceneId,
      });
      return;
    }
    this.focusRequested.emit({
      target: generation.target,
      sessionId: generation.sessionId,
      sceneId: generation.sceneId,
    });
  }

  selectPrevious(event: Event): void {
    event.stopPropagation();
    if (!this.canSelectPrevious()) return;
    this.selectedSessionId.set(this.generations()[this.selectedIndex() - 1].id);
  }

  selectNext(event: Event): void {
    event.stopPropagation();
    if (!this.canSelectNext()) return;
    this.selectedSessionId.set(this.generations()[this.selectedIndex() + 1].id);
  }

  async stopSelected(event: Event): Promise<void> {
    event.stopPropagation();
    const generation = this.selectedGeneration();
    if (!generation) return;

    if (generation.target === 'selection-edit') {
      await this.selectionEdits.cancel(generation.sessionId);
      return;
    }
    await this.generationSessions.stop(generation.blockId);
  }

  dismissSelected(event: Event): void {
    event.stopPropagation();
    const generation = this.selectedGeneration();
    if (!generation?.isComplete) return;

    this.dismissedGenerationIds.update(currentIds => {
      const nextIds = new Set(currentIds);
      nextIds.add(generation.id);
      return nextIds;
    });
    this.trackedProseGenerations.update(generations => (
      generations.filter(candidate => candidate.item.id !== generation.id)
    ));
  }

  private removeTrackedGeneration(
    generations: TrackedProseGeneration[],
    generationId: string,
  ): void {
    const index = generations.findIndex(generation => generation.item.id === generationId);
    if (index !== -1) generations.splice(index, 1);
  }

  private resolveScene(sceneId: string, hierarchy: readonly ActDto[]): string | null {
    for (const act of hierarchy) {
      for (const chapter of act.chapters ?? []) {
        const scene = (chapter.scenes ?? []).find(candidate => candidate.id === sceneId);
        if (scene) {
          return [
            this.formatLocation('Act', act.position, act.title),
            this.formatLocation('Chapter', chapter.position, chapter.title),
            this.formatLocation('Scene', scene.position, scene.title),
          ].join(' › ');
        }
      }
    }
    return null;
  }

  private formatLocation(type: string, position: number, title: string): string {
    const numberedLocation = `${type} ${position + 1}`;
    return title.trim() ? `${numberedLocation}: ${title}` : numberedLocation;
  }

  private countWords(content: string): number {
    return content.trim() ? content.trim().split(/\s+/u).length : 0;
  }
}
