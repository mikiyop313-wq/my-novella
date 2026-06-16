import { Component, DestroyRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { CdkMenuModule } from '@angular/cdk/menu';

import {
  ActDto,
  ChapterDto,
  ManuscriptMode,
  SceneDto,
  UpdateStructurePositionsPayload,
} from '../../../../shared/models/manuscript.model';

import { ToastService } from '../../shared/services/toast.service';
import { ElementAnimationDirective } from '../../shared/directives/element-animation.directive';
import { OutlineStore } from './store/outline.store';

// -----------------------------------------------------------------------------
// Drag Helpers
// -----------------------------------------------------------------------------

// Returns a reordered copy of one list without mutating CDK's source data.
const moveWithin = <T>(items: T[], previousIndex: number, currentIndex: number): T[] => {
  const next = [...items];
  const [moved] = next.splice(previousIndex, 1);

  if (!moved) {
    return items;
  }

  next.splice(currentIndex, 0, moved);
  return next;
};

// Returns copied source/target lists after moving one item across containers.
const transferBetween = <T>(
  source: T[],
  target: T[],
  previousIndex: number,
  currentIndex: number,
): { source: T[]; target: T[] } => {
  const nextSource = [...source];
  const [moved] = nextSource.splice(previousIndex, 1);

  if (!moved) {
    return { source, target };
  }

  const nextTarget = [...target];
  nextTarget.splice(currentIndex, 0, moved);
  return { source: nextSource, target: nextTarget };
};

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

@Component({
  selector: 'app-outline',
  standalone: true,
  imports: [DragDropModule, DecimalPipe, CdkMenuModule, ElementAnimationDirective],
  templateUrl: './outline.html',
  styleUrl: './outline.scss',
})
export class Outline implements OnInit {
  // Store and services.
  readonly store = inject(OutlineStore);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toastService = inject(ToastService);

  @ViewChild('outlineAnimation') private outlineAnimation?: ElementAnimationDirective;

  // Local UI state for collapsed sections and inline title/comment editing.
  collapsed = signal<Record<string, boolean>>({});
  editing = signal<Record<string, boolean>>({});

  // ---------------------------------------------------------------------------
  // View State
  // ---------------------------------------------------------------------------

  toggleCollapse(id: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    this.collapsed.update((state) => ({
      ...state,
      [id]: !state[id],
    }));
  }

  toggleEdit(id: string): void {
    this.editing.update((state) => ({
      ...state,
      [id]: !state[id],
    }));
  }

  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.route.parent?.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const bookId = params.get('bookId');
      if (!bookId) return;

      this.store.enterBook(bookId);
    });
  }

  openManuscript(mode: ManuscriptMode, id: string): void {
    const bookId = this.store.bookId();
    if (!bookId) return;

    this.router.navigate(['/workspace', bookId, 'manuscript', mode, id]);
  }

  // ---------------------------------------------------------------------------
  // Display Helpers
  // ---------------------------------------------------------------------------

  getChapterWordCount(chapter: ChapterDto): number {
    return (chapter.scenes || []).reduce((sum, scene) => sum + (scene.wordCount || 0), 0);
  }

  getActWordCount(act: ActDto): number {
    return (act.chapters || []).reduce(
      (sum, chapter) => sum + this.getChapterWordCount(chapter),
      0,
    );
  }

  chapterDropListIds(): string[] {
    return this.store.bookHierarchy().map((act) => this.chapterDropListId(act.id));
  }

  sceneDropListIds(): string[] {
    return this.store
      .bookHierarchy()
      .flatMap((act) => (act.chapters ?? []).map((chapter) => this.sceneDropListId(chapter.id)));
  }

  chapterDropListId(actId: string): string {
    return `outline-chapters-${actId}`;
  }

  sceneDropListId(chapterId: string): string {
    return `outline-scenes-${chapterId}`;
  }

  // ---------------------------------------------------------------------------
  // Create Actions
  // ---------------------------------------------------------------------------

  // Create actions animate the newly inserted outline item when the view is ready.
  async createAct(bookId: string): Promise<void> {
    const previousIds = new Set(this.store.bookHierarchy().map((act) => act.id));
    let createdId: string | undefined;
    const action = async (): Promise<void> => {
      await this.store.createAct(bookId);
      createdId = this.store.bookHierarchy().find((act) => !previousIds.has(act.id))?.id;
    };

    try {
      await (this.outlineAnimation
        ? this.outlineAnimation.animateAfterCreate(action, () =>
            this.findOutlineItemElement(createdId),
          )
        : action());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create act.';
      this.toastService.error(message, 'Outline');
    }
  }

  async createChapter(actId: string): Promise<void> {
    const previousIds = new Set((this.findAct(actId)?.chapters ?? []).map((chapter) => chapter.id));
    let createdId: string | undefined;
    const action = async (): Promise<void> => {
      await this.store.createChapter(actId);
      createdId = (this.findAct(actId)?.chapters ?? []).find(
        (chapter) => !previousIds.has(chapter.id),
      )?.id;
    };

    try {
      await (this.outlineAnimation
        ? this.outlineAnimation.animateAfterCreate(action, () =>
            this.findOutlineItemElement(createdId),
          )
        : action());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create chapter.';
      this.toastService.error(message, 'Outline');
    }
  }

  async createScene(chapterId: string): Promise<void> {
    const previousIds = new Set(
      (this.findChapter(chapterId)?.scenes ?? []).map((scene) => scene.id),
    );
    let createdId: string | undefined;
    const action = async (): Promise<void> => {
      await this.store.createScene(chapterId);
      createdId = (this.findChapter(chapterId)?.scenes ?? []).find(
        (scene) => !previousIds.has(scene.id),
      )?.id;
    };

    try {
      await (this.outlineAnimation
        ? this.outlineAnimation.animateAfterCreate(action, () =>
            this.findOutlineItemElement(createdId),
          )
        : action());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create scene.';
      this.toastService.error(message, 'Outline');
    }
  }

  // ---------------------------------------------------------------------------
  // Delete / Archive Actions
  // ---------------------------------------------------------------------------

  // Delete and archive actions share the same leave animation before state removal.
  async deleteAct(actId: string): Promise<void> {
    try {
      const element = this.findOutlineItemElement(actId);
      await (this.outlineAnimation
        ? this.outlineAnimation.animateBeforeDelete(element, () => this.store.deleteAct(actId))
        : this.store.deleteAct(actId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete act.';
      this.toastService.error(message, 'Outline');
    }
  }

  async deleteChapter(chapterId: string): Promise<void> {
    try {
      const element = this.findOutlineItemElement(chapterId);
      await (this.outlineAnimation
        ? this.outlineAnimation.animateBeforeDelete(element, () =>
            this.store.deleteChapter(chapterId),
          )
        : this.store.deleteChapter(chapterId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete chapter.';
      this.toastService.error(message, 'Outline');
    }
  }

  async deleteScene(sceneId: string): Promise<void> {
    try {
      const element = this.findOutlineItemElement(sceneId);
      await (this.outlineAnimation
        ? this.outlineAnimation.animateBeforeDelete(element, () => this.store.deleteScene(sceneId))
        : this.store.deleteScene(sceneId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete scene.';
      this.toastService.error(message, 'Outline');
    }
  }

  async archiveAct(actId: string): Promise<void> {
    try {
      const element = this.findOutlineItemElement(actId);
      await (this.outlineAnimation
        ? this.outlineAnimation.animateBeforeDelete(element, () => this.store.archiveAct(actId))
        : this.store.archiveAct(actId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to archive act.';
      this.toastService.error(message, 'Outline');
    }
  }

  async archiveChapter(chapterId: string): Promise<void> {
    try {
      const element = this.findOutlineItemElement(chapterId);
      await (this.outlineAnimation
        ? this.outlineAnimation.animateBeforeDelete(element, () =>
            this.store.archiveChapter(chapterId),
          )
        : this.store.archiveChapter(chapterId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to archive chapter.';
      this.toastService.error(message, 'Outline');
    }
  }

  async archiveScene(sceneId: string): Promise<void> {
    try {
      const element = this.findOutlineItemElement(sceneId);
      await (this.outlineAnimation
        ? this.outlineAnimation.animateBeforeDelete(element, () => this.store.archiveScene(sceneId))
        : this.store.archiveScene(sceneId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to archive scene.';
      this.toastService.error(message, 'Outline');
    }
  }

  // ---------------------------------------------------------------------------
  // Inline Metadata Editing
  // ---------------------------------------------------------------------------

  async updateActTitle(actId: string, title: string): Promise<void> {
    const nextTitle = this.normalizeEditableValue(title);
    const currentTitle = this.findAct(actId)?.title ?? '';

    if (currentTitle === nextTitle) {
      this.editing.update((state) => ({ ...state, [actId]: false }));
      return;
    }

    try {
      await this.store.updateAct({ id: actId, title: nextTitle });
      this.editing.update((state) => ({ ...state, [actId]: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update act title.';
      this.editing.update((state) => ({ ...state, [actId]: true }));
      this.toastService.error(message, 'Outline');
    }
  }

  async updateChapterTitle(chapterId: string, title: string): Promise<void> {
    const nextTitle = this.normalizeEditableValue(title);
    const currentTitle = this.findChapter(chapterId)?.title ?? '';

    if (currentTitle === nextTitle) {
      this.editing.update((state) => ({ ...state, [chapterId]: false }));
      return;
    }

    try {
      await this.store.updateChapter({ id: chapterId, title: nextTitle });
      this.editing.update((state) => ({ ...state, [chapterId]: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update chapter title.';
      this.editing.update((state) => ({ ...state, [chapterId]: true }));
      this.toastService.error(message, 'Outline');
    }
  }

  async updateSceneTitle(sceneId: string, title: string, event?: FocusEvent): Promise<void> {
    const keepEditing = this.shouldKeepEditing(event);
    const nextTitle = this.normalizeEditableValue(title);
    const currentTitle = this.findScene(sceneId)?.title ?? '';

    if (currentTitle === nextTitle) {
      this.setSceneEditing(sceneId, keepEditing);
      return;
    }

    try {
      await this.store.updateScene({ id: sceneId, title: nextTitle });
      this.setSceneEditing(sceneId, keepEditing);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update scene title.';
      this.editing.update((state) => ({ ...state, [sceneId]: true }));
      this.toastService.error(message, 'Outline');
    }
  }

  async updateSceneSummary(sceneId: string, summary: string, event?: FocusEvent): Promise<void> {
    // The outline card labels this as comments, while the current API persists it as scene summary.
    const keepEditing = this.shouldKeepEditing(event);
    const nextSummary = this.normalizeEditableValue(summary);
    const currentSummary = this.findScene(sceneId)?.summary ?? '';

    if (currentSummary === nextSummary) {
      this.setSceneEditing(sceneId, keepEditing);
      return;
    }

    try {
      await this.store.updateScene({ id: sceneId, summary: nextSummary });
      this.setSceneEditing(sceneId, keepEditing);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update scene summary.';
      this.editing.update((state) => ({ ...state, [sceneId]: true }));
      this.toastService.error(message, 'Outline');
    }
  }

  // ---------------------------------------------------------------------------
  // Lookup Helpers
  // ---------------------------------------------------------------------------

  private normalizeEditableValue(value: string): string {
    return value.trim().length === 0 ? '' : value;
  }

  private setSceneEditing(sceneId: string, keepEditing: boolean): void {
    this.editing.update((state) => ({ ...state, [sceneId]: keepEditing }));
  }

  private findAct(actId: string): ActDto | undefined {
    return this.store.bookHierarchy().find((act) => act.id === actId);
  }

  private findChapter(chapterId: string): ChapterDto | undefined {
    for (const act of this.store.bookHierarchy()) {
      const chapter = (act.chapters ?? []).find((item) => item.id === chapterId);
      if (chapter) return chapter;
    }

    return undefined;
  }

  private findScene(sceneId: string): SceneDto | undefined {
    for (const act of this.store.bookHierarchy()) {
      for (const chapter of act.chapters ?? []) {
        const scene = (chapter.scenes ?? []).find((item) => item.id === sceneId);
        if (scene) return scene;
      }
    }

    return undefined;
  }

  private findOutlineItemElement(id: string | undefined): HTMLElement | undefined {
    if (!id) {
      return undefined;
    }

    return Array.from(document.querySelectorAll<HTMLElement>('[data-outline-item-id]')).find(
      (element) => element.dataset['outlineItemId'] === id,
    );
  }

  // ---------------------------------------------------------------------------
  // Editing Focus Helpers
  // ---------------------------------------------------------------------------

  // Keeps scene edit mode active while focus moves between fields in the same card.
  private shouldKeepEditing(event?: FocusEvent): boolean {
    if (!event) {
      return false;
    }

    const target = event.target as HTMLElement;
    const relatedTarget = event.relatedTarget as HTMLElement | null;

    if (relatedTarget && target) {
      const targetCard = target.closest('.scene-card');
      const relatedCard = relatedTarget.closest('.scene-card');

      if (targetCard && targetCard === relatedCard) {
        return true;
      }
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Drag And Drop Actions
  // ---------------------------------------------------------------------------

  async onActDrop(event: CdkDragDrop<ActDto[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const acts = moveWithin(event.container.data, event.previousIndex, event.currentIndex);

    try {
      await this.store.updateStructurePositions({
        acts: acts.map((act, position) => ({
          id: act.id,
          bookId: act.bookId,
          position,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reorder acts.';
      this.toastService.error(message, 'Outline');
    }
  }

  async onChapterDrop(event: CdkDragDrop<ChapterDto[]>, targetActId: string): Promise<void> {
    const sourceActId = event.previousContainer.id.replace('outline-chapters-', '');

    if (sourceActId === targetActId && event.previousIndex === event.currentIndex) {
      return;
    }

    const payload: UpdateStructurePositionsPayload = {
      chapters: this.getChapterPositionUpdates(event, sourceActId, targetActId),
    };

    try {
      await this.store.updateStructurePositions(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move chapter.';
      this.toastService.error(message, 'Outline');
    }
  }

  async onSceneDrop(event: CdkDragDrop<SceneDto[]>, targetChapterId: string): Promise<void> {
    const sourceChapterId = event.previousContainer.id.replace('outline-scenes-', '');

    if (sourceChapterId === targetChapterId && event.previousIndex === event.currentIndex) {
      return;
    }

    const payload: UpdateStructurePositionsPayload = {
      scenes: this.getScenePositionUpdates(event, sourceChapterId, targetChapterId),
    };

    try {
      await this.store.updateStructurePositions(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move scene.';
      this.toastService.error(message, 'Outline');
    }
  }

  // ---------------------------------------------------------------------------
  // Position Payload Builders
  // ---------------------------------------------------------------------------

  private getChapterPositionUpdates(
    event: CdkDragDrop<ChapterDto[]>,
    sourceActId: string,
    targetActId: string,
  ): UpdateStructurePositionsPayload['chapters'] {
    if (sourceActId === targetActId) {
      return moveWithin(event.container.data, event.previousIndex, event.currentIndex).map(
        (chapter, position) => ({
          id: chapter.id,
          actId: targetActId,
          position,
        }),
      );
    }

    const result = transferBetween(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );

    return [
      ...result.source.map((chapter, position) => ({
        id: chapter.id,
        actId: sourceActId,
        position,
      })),
      ...result.target.map((chapter, position) => ({
        id: chapter.id,
        actId: targetActId,
        position,
      })),
    ];
  }

  private getScenePositionUpdates(
    event: CdkDragDrop<SceneDto[]>,
    sourceChapterId: string,
    targetChapterId: string,
  ): UpdateStructurePositionsPayload['scenes'] {
    if (sourceChapterId === targetChapterId) {
      return moveWithin(event.container.data, event.previousIndex, event.currentIndex).map(
        (scene, position) => ({
          id: scene.id,
          chapterId: targetChapterId,
          position,
        }),
      );
    }

    const result = transferBetween(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );

    return [
      ...result.source.map((scene, position) => ({
        id: scene.id,
        chapterId: sourceChapterId,
        position,
      })),
      ...result.target.map((scene, position) => ({
        id: scene.id,
        chapterId: targetChapterId,
        position,
      })),
    ];
  }
}
