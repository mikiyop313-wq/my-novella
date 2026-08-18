import { Component, computed, effect, inject, output, signal } from '@angular/core';

import {
  AiGenerationSession,
  AiGenerationSessionService,
} from '../../../../core/services/ai-generation-session.service';
import { ManuscriptStore } from '../../store/manuscript.store';

export interface ProseGenerationFocusRequest {
  blockId: string;
  sceneId: string;
}

interface ProseGenerationItem extends ProseGenerationFocusRequest {
  breadcrumb: string;
  session: AiGenerationSession;
  wordCount: number;
}

@Component({
  selector: 'app-prose-generation-widget',
  standalone: true,
  templateUrl: './prose-generation-widget.component.html',
  styleUrl: './prose-generation-widget.component.scss',
})
export class ProseGenerationWidgetComponent {
  private readonly generationSessions = inject(AiGenerationSessionService);
  private readonly manuscriptStore = inject(ManuscriptStore);

  readonly focusRequested = output<ProseGenerationFocusRequest>();

  private readonly selectedSessionId = signal<string | null>(null);
  private previousSessionIds: string[] = [];

  readonly generations = computed<ProseGenerationItem[]>(() => {
    const hierarchy = this.manuscriptStore.bookHierarchy();

    return this.generationSessions.sessions().flatMap(session => {
      if (
        session.source !== 'manuscript-prose'
        || this.isTerminal(session.status())
        || !session.scopeId
      ) return [];

      for (const act of hierarchy) {
        for (const chapter of act.chapters || []) {
          const scene = (chapter.scenes || []).find(item => item.id === session.scopeId);
          if (scene) {
            const breadcrumb = [
              this.formatLocation('Act', act.position, act.title),
              this.formatLocation('Chapter', chapter.position, chapter.title),
              this.formatLocation('Scene', scene.position, scene.title),
            ].join(' › ');

            return [{
              blockId: session.id,
              sceneId: scene.id,
              breadcrumb,
              session,
              wordCount: this.countWords(session.content()),
            }];
          }
        }
      }

      return [];
    });
  });

  readonly selectedIndex = computed(() => {
    const sessionId = this.selectedSessionId();
    const index = this.generations().findIndex(item => item.session.id === sessionId);
    return index === -1 ? 0 : index;
  });

  readonly selectedGeneration = computed(() => (
    this.generations()[this.selectedIndex()] ?? null
  ));

  readonly hasMultipleGenerations = computed(() => this.generations().length > 1);
  readonly canSelectPrevious = computed(() => this.selectedIndex() > 0);
  readonly canSelectNext = computed(() => this.selectedIndex() < this.generations().length - 1);

  constructor() {
    effect(() => {
      const sessionIds = this.generations().map(item => item.session.id);
      const selectedSessionId = this.selectedSessionId();
      const newestSessionId = [...sessionIds]
        .reverse()
        .find(sessionId => !this.previousSessionIds.includes(sessionId));

      if (newestSessionId) {
        this.selectedSessionId.set(newestSessionId);
      } else if (!selectedSessionId || !sessionIds.includes(selectedSessionId)) {
        const previousIndex = Math.max(0, this.previousSessionIds.indexOf(selectedSessionId ?? ''));
        this.selectedSessionId.set(
          sessionIds[Math.min(previousIndex, sessionIds.length - 1)] ?? null,
        );
      }

      this.previousSessionIds = sessionIds;
    });
  }

  requestFocus(): void {
    const generation = this.selectedGeneration();
    if (!generation) return;

    this.focusRequested.emit({
      blockId: generation.blockId,
      sceneId: generation.sceneId,
    });
  }

  selectPrevious(event: Event): void {
    event.stopPropagation();
    if (!this.canSelectPrevious()) return;

    this.selectedSessionId.set(this.generations()[this.selectedIndex() - 1].session.id);
  }

  selectNext(event: Event): void {
    event.stopPropagation();
    if (!this.canSelectNext()) return;

    this.selectedSessionId.set(this.generations()[this.selectedIndex() + 1].session.id);
  }

  async stopSelected(event: Event): Promise<void> {
    event.stopPropagation();
    const generation = this.selectedGeneration();
    if (!generation) return;

    await this.generationSessions.stop(generation.session.id);
  }

  private formatLocation(type: string, position: number, title: string): string {
    const numberedLocation = `${type} ${position + 1}`;
    return title.trim() ? `${numberedLocation}: ${title}` : numberedLocation;
  }

  private countWords(content: string): number {
    return content.trim() ? content.trim().split(/\s+/).length : 0;
  }

  private isTerminal(status: string): boolean {
    return status === 'complete' || status === 'stopped' || status === 'failed';
  }
}
