import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';

import { AutocompleteDropdownComponent } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { ConfirmModalService } from '../../../../shared/components/confirm-modal/confirm-modal.service';
import { OverlayMenuDirective } from '../../../../shared/directives/overlay-menu.directive';
import { ArchiveStore } from '../../store/archive.store';
import type {
  ArchiveChapterDto,
  ArchiveSceneDto,
} from '../../../../../../shared/models/manuscript.model';

type ArchiveTab = 'acts' | 'chapters' | 'scenes';
type ArchiveEntityType = 'act' | 'chapter' | 'scene';
type RestoreSelection = { type: 'chapter' | 'scene'; id: string };

@Component({
  selector: 'app-archive-settings',
  imports: [AutocompleteDropdownComponent, NgTemplateOutlet, OverlayMenuDirective],
  providers: [ArchiveStore],
  templateUrl: './archive-settings.component.html',
  styleUrl: './archive-settings.component.scss',
})
export class ArchiveSettingsComponent implements OnInit {
  readonly bookId = input.required<string>();
  readonly store = inject(ArchiveStore);
  private readonly confirmService = inject(ConfirmModalService);

  readonly activeTab = signal<ArchiveTab>('acts');
  readonly restoreSelection = signal<RestoreSelection | null>(null);
  readonly selectedTargetId = signal('');

  ngOnInit(): void {
    void this.store.load(this.bookId());
  }

  selectTab(tab: ArchiveTab): void {
    if (tab === this.activeTab()) return;

    this.cancelTargetSelection();
    this.activeTab.set(tab);
  }

  beginTargetSelection(type: RestoreSelection['type'], id: string): void {
    if (this.store.isBusy()) return;

    this.restoreSelection.set({ type, id });
    this.selectedTargetId.set('');
  }

  isSelecting(type: RestoreSelection['type'], id: string): boolean {
    const selection = this.restoreSelection();
    return selection?.type === type && selection.id === id;
  }

  updateTarget(value: unknown): void {
    this.selectedTargetId.set(typeof value === 'string' ? value : '');
  }

  cancelTargetSelection(): void {
    if (this.store.isBusy()) return;

    this.restoreSelection.set(null);
    this.selectedTargetId.set('');
  }

  async restoreAct(id: string): Promise<void> {
    const restored = await this.store.restoreAct(id);
    if (restored) {
      this.restoreSelection.set(null);
      this.selectedTargetId.set('');
    }
  }

  restoreItem(type: ArchiveEntityType, id: string): void {
    if (this.store.isBusy()) return;

    if (type === 'act') {
      void this.restoreAct(id);
      return;
    }

    this.beginTargetSelection(type, id);
  }

  isItemBusy(type: ArchiveEntityType, id: string): boolean {
    const key = `${type}:${id}`;
    return this.store.restoringKey() === key || this.store.deletingKey() === key;
  }

  itemActionLabel(type: ArchiveEntityType, id: string, title: string): string {
    const key = `${type}:${id}`;
    if (this.store.restoringKey() === key) return `Restoring ${type} ${title}`;
    if (this.store.deletingKey() === key) return `Deleting ${type} ${title}`;
    return `Actions for ${type} ${title}`;
  }

  async confirmTargetRestore(): Promise<void> {
    const selection = this.restoreSelection();
    const targetId = this.selectedTargetId();
    if (!selection || !targetId || this.store.isBusy()) return;

    const restored =
      selection.type === 'chapter'
        ? await this.store.restoreChapter(selection.id, targetId)
        : await this.store.restoreScene(selection.id, targetId);

    if (restored) {
      this.restoreSelection.set(null);
      this.selectedTargetId.set('');
    }
  }

  requestDelete(type: ArchiveEntityType, id: string, title: string): void {
    if (this.store.isBusy()) return;

    this.cancelTargetSelection();
    this.confirmService.open(
      `Delete archived ${type}?`,
      this.deleteConfirmationMessage(type, title),
      () => {
        void this.deleteItem(type, id);
      },
    );
  }

  private async deleteItem(type: ArchiveEntityType, id: string): Promise<void> {
    if (this.store.isBusy()) return;

    if (type === 'act') {
      await this.store.deleteAct(id);
    } else if (type === 'chapter') {
      await this.store.deleteChapter(id);
    } else {
      await this.store.deleteScene(id);
    }
  }

  private deleteConfirmationMessage(type: ArchiveEntityType, title: string): string {
    if (type === 'act') {
      return `"${title}" and all chapters, scenes, and manuscript content inside it will be permanently deleted. This cannot be undone.`;
    }
    if (type === 'chapter') {
      return `"${title}" and all scenes and manuscript content inside it will be permanently deleted. This cannot be undone.`;
    }
    return `"${title}" and its manuscript content will be permanently deleted. This cannot be undone.`;
  }

  parentActLabel(chapter: ArchiveChapterDto): string {
    if (chapter.actId === null) {
      return `Previously in ${chapter.archiveParentTitle} (deleted)`;
    }

    const parentAct = this.store.activeHierarchy().find((act) => act.id === chapter.actId);
    if (!parentAct) {
      throw new Error(`Active archive parent act ${chapter.actId} was not loaded.`);
    }

    return `Chapter in ${parentAct.title}`;
  }

  parentChapterLabel(scene: ArchiveSceneDto): string {
    if (scene.chapterId === null) {
      return `Previously in ${scene.archiveParentTitle} (deleted)`;
    }

    for (const act of this.store.activeHierarchy()) {
      const chapter = (act.chapters ?? []).find((candidate) => candidate.id === scene.chapterId);
      if (chapter) return `${act.title} / ${chapter.title}`;
    }

    throw new Error(`Active archive parent chapter ${scene.chapterId} was not loaded.`);
  }

  sceneTitle(title: string): string {
    return title.trim() || 'Untitled Scene';
  }
}
