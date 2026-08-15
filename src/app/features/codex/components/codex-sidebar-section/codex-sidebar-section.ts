import { LowerCasePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OverlayModule } from '@angular/cdk/overlay';
import { CdkMenuModule } from '@angular/cdk/menu';

import { WorkspaceStore } from '../../../../features/workspace/workspace.store';
import { WorkspaceBookStore } from '../../../../features/workspace/workspace-book.store';
import { DropdownOption } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import {
  type CodexEntryDto,
  type CodexEntryListFiltersDto,
  type CodexEntryType,
  type CodexTrackingSetting,
} from '../../../../../../shared/models/codex.model';
import { CodexEntryMenuComponent } from '../codex-entry-menu/codex-entry-menu.component';
import { CodexStore } from '../../store/codex.store';
import { createCodexImageUrl, revokeCodexImageUrl } from '../../utils/codex-image-url';
import { CodexContextTrieService } from '../../services/codex-context-trie.service';
import { CodexEntryOpenerService } from '../../services/codex-entry-opener.service';
import { CodexWindowService } from '../../services/codex-window.service';
import {
  type CodexDetachRequest,
  type CodexEntryMenuPayload,
} from '../../../../../../shared/models/codex-window.model';
import { MarkdownPlainTextPipe } from '../../../../shared/pipes/markdown-plain-text.pipe';
import { ElementAnimationDirective } from '../../../../shared/directives/element-animation.directive';

type CodexEntityType = {
  value: CodexEntryType;
  label: string;
  singularLabel: string;
  description: string;
};

export type FilterTriState = 'include' | 'exclude' | 'any';

@Component({
  selector: 'app-codex-sidebar-section',
  standalone: true,
  imports: [
    LowerCasePipe,
    NgTemplateOutlet,
    FormsModule,
    OverlayModule,
    CdkMenuModule,
    CodexEntryMenuComponent,
    MarkdownPlainTextPipe,
    ElementAnimationDirective,
  ],
  templateUrl: './codex-sidebar-section.html',
  styleUrl: './codex-sidebar-section.scss',
})
export class CodexSidebarSection {
  readonly store = inject(WorkspaceStore);
  readonly workspaceBookStore = inject(WorkspaceBookStore);
  readonly codexStore = inject(CodexStore);
  readonly codexContextTrie = inject(CodexContextTrieService);
  readonly codexEntryOpener = inject(CodexEntryOpenerService);
  readonly codexWindowService = inject(CodexWindowService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly activeType = this.codexStore.activeType;
  readonly searchQuery = this.codexStore.searchQuery;
  readonly entryFilters = this.codexStore.entryFilters;
  readonly entries = this.codexStore.entries;
  readonly selectedEntry = this.codexStore.selectedEntry;
  readonly isLoadingEntries = this.codexStore.isLoadingEntries;
  readonly isLoadingSelectedEntry = this.codexStore.isLoadingSelectedEntry;
  readonly isCreatingEntry = this.codexStore.isCreatingEntry;
  readonly isSavingEntry = this.codexStore.isSavingEntry;
  readonly error = this.codexStore.error;
  readonly entryImageUrls = signal<Record<string, string>>({});
  readonly selectedEntryImageUrl = signal<string | null>(null);

  // Filter State
  readonly filterNotes = signal<FilterTriState>('any');
  readonly filterDescription = signal<FilterTriState>('any');
  readonly filterProgression = signal<FilterTriState>('any');
  readonly filterArchived = signal<FilterTriState>('exclude');
  readonly filterTracking = signal<Set<CodexTrackingSetting>>(new Set());
  readonly isFilterMenuOpen = signal<boolean>(false);

  readonly entityTypes: readonly CodexEntityType[] = [
    {
      value: 'character',
      label: 'Characters',
      singularLabel: 'Character',
      description: 'People, narrators, rivals, allies, and recurring cast.',
    },
    {
      value: 'location',
      label: 'Locations',
      singularLabel: 'Location',
      description: 'Places, rooms, cities, landmarks, and recurring settings.',
    },
    {
      value: 'object',
      label: 'Objects',
      singularLabel: 'Object',
      description: 'Items, artifacts, weapons, and key belongings.',
    },
    {
      value: 'lore',
      label: 'Lore',
      singularLabel: 'Lore',
      description: 'History, magic systems, rules, and world-building facts.',
    },
    {
      value: 'subplot',
      label: 'Subplots',
      singularLabel: 'Subplot',
      description: 'Minor story arcs, character goals, and side quests.',
    },
    {
      value: 'other',
      label: 'Other',
      singularLabel: 'Other',
      description: 'Miscellaneous notes, ideas, and unclassified entries.',
    },
  ];

  readonly entityDropdownOptions: DropdownOption[] = this.entityTypes.map(type => ({
    value: type.value,
    label: type.singularLabel,
  }));

  readonly activeEntityType = computed(
    () => this.entityTypes.find(type => type.value === this.activeType()) ?? this.entityTypes[0],
  );

  readonly hasSearchQuery = computed(() => this.searchQuery().trim().length > 0);

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly entryAnimation = viewChild<ElementAnimationDirective>('entryAnimation');

  constructor() {
    effect((onCleanup) => {
      const bookId = this.store.bookId();
      const type = this.activeType();
      const query = this.searchQuery().trim();
      const filters = this.entryFilters();
      const timeoutId = window.setTimeout(() => {
        void this.codexStore.loadEntries(bookId, type, query, filters);
      }, 250);

      onCleanup(() => window.clearTimeout(timeoutId));
    }, { allowSignalWrites: true });

    effect(() => {
      this.setEntryImageUrls(this.entries());
    }, { allowSignalWrites: true });

    effect(() => {
      this.setSelectedEntryImageUrl(createCodexImageUrl(this.selectedEntry()?.image));
    }, { allowSignalWrites: true });

    const cleanupDetachedChangeListener = this.codexWindowService.onDetachedEntryChanged(event => {
      if (event.bookId !== this.store.bookId()) return;

      void this.codexStore.loadEntries(
        this.store.bookId(),
        this.activeType(),
        this.searchQuery().trim(),
        this.entryFilters(),
      );
      void this.codexContextTrie.refreshCurrentContext();
    });

    this.destroyRef.onDestroy(() => {
      cleanupDetachedChangeListener();
      this.clearEntryImageUrls();
      this.setSelectedEntryImageUrl(null);
    });
  }

  selectType(type: CodexEntryType): void {
    this.codexStore.setActiveType(type);
  }

  updateSearchQuery(query: string): void {
    this.codexStore.setSearchQuery(query);
  }

  handleSearchClick(): void {
    if (!this.store.sidebarOpen()) {
      this.store.openSidebar();
      setTimeout(() => {
        this.searchInput()?.nativeElement.focus();
      }, 50);
    } else {
      this.searchInput()?.nativeElement.focus();
    }
  }

  getTrackingLabel(setting: CodexTrackingSetting): string {
    switch (setting) {
      case 'always_include':
        return 'Always';
      case 'include_when_detected':
        return 'Detected';
      case 'manual':
        return 'Manual';
      case 'never_include':
        return 'Never';
    }
  }

  openCreateMenu(type: CodexEntryType): void {
    this.codexStore.openCreateMenu(type);
  }

  closeCreateMenu(): void {
    this.codexStore.closeCreateMenu();
  }

  async openEntry(entry: CodexEntryDto): Promise<void> {
    await this.codexEntryOpener.open(entry.id);
  }

  getEntryImageUrl(entry: CodexEntryDto): string | null {
    return this.entryImageUrls()[entry.id] ?? null;
  }

  async saveEntry(entryData: CodexEntryMenuPayload): Promise<void> {
    if (this.selectedEntry()) {
      await this.codexStore.saveEntry(this.store.bookId(), entryData);
      return;
    }

    const previousEntryIds = new Set(this.entries().map(entry => entry.id));
    const previousEntryPositions = this.captureEntryPositions();
    const animation = this.entryAnimation();
    let createdEntryId: string | undefined;
    const createEntry = async (): Promise<void> => {
      await this.codexStore.saveEntry(this.store.bookId(), entryData);
      createdEntryId = this.entries().find(entry => !previousEntryIds.has(entry.id))?.id;
      this.changeDetectorRef.detectChanges();

      if (animation && createdEntryId) {
        this.findEntryElement(createdEntryId)?.classList.add('codex-entry-pending');
        await this.animateEntryReflow(previousEntryPositions, createdEntryId);
      }
    };

    await (animation
      ? animation.animateAfterCreate(createEntry, () => {
          const createdEntry = this.findEntryElement(createdEntryId);
          createdEntry?.classList.remove('codex-entry-pending');
          return createdEntry;
        })
      : createEntry());
  }

  async archiveEntry(): Promise<void> {
    await this.codexStore.archiveEntry(this.store.bookId());
  }

  async restoreEntry(): Promise<void> {
    await this.codexStore.restoreEntry(this.store.bookId());
  }

  async deleteEntry(): Promise<void> {
    const entryId = this.selectedEntry()?.id;
    const entryElement = this.findEntryElement(entryId);
    const deleteEntry = async (): Promise<void> => {
      await this.codexStore.deleteEntry(this.store.bookId());
      this.changeDetectorRef.detectChanges();
    };
    const animation = this.entryAnimation();

    if (!animation || !entryElement) {
      await deleteEntry();
      return;
    }

    await animation.animateBeforeDelete(entryElement, deleteEntry);
    if (this.entries().some(entry => entry.id === entryId)) {
      entryElement.classList.remove('codex-entry-leaving');
    }
  }

  async detachEntryWindow(request: CodexDetachRequest): Promise<void> {
    await this.codexWindowService.openDetachedWindow({
      ...request,
      bookId: this.store.bookId(),
    });
    this.closeCreateMenu();
  }

  private setEntryImageUrls(entries: CodexEntryDto[]): void {
    this.clearEntryImageUrls();

    const urls: Record<string, string> = {};

    for (const entry of entries) {
      const url = createCodexImageUrl(entry.image);
      if (url) {
        urls[entry.id] = url;
      }
    }

    this.entryImageUrls.set(urls);
  }

  private findEntryElement(entryId: string | undefined): HTMLElement | null {
    if (!entryId) return null;

    return this.getEntryElements()
      .find(element => element.dataset['codexEntryId'] === entryId) ?? null;
  }

  private getEntryElements(): HTMLElement[] {
    return Array.from(
      this.hostElement.nativeElement.querySelectorAll<HTMLElement>('[data-codex-entry-id]'),
    );
  }

  private captureEntryPositions(): Map<string, number> {
    return new Map(
      this.getEntryElements().flatMap(element => {
        const entryId = element.dataset['codexEntryId'];
        return entryId ? [[entryId, element.getBoundingClientRect().top] as const] : [];
      }),
    );
  }

  private async animateEntryReflow(
    previousPositions: ReadonlyMap<string, number>,
    createdEntryId: string,
  ): Promise<void> {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const animations = this.getEntryElements().flatMap(element => {
      const entryId = element.dataset['codexEntryId'];
      const previousTop = entryId ? previousPositions.get(entryId) : undefined;
      if (!entryId || entryId === createdEntryId || previousTop === undefined) return [];

      const offsetY = previousTop - element.getBoundingClientRect().top;
      if (Math.abs(offsetY) < 0.5 || typeof element.animate !== 'function') return [];

      return [element.animate(
        [
          { transform: 'translateY(' + offsetY + 'px)' },
          { transform: 'translateY(0)' },
        ],
        { duration: 160, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
      )];
    });

    await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
    animations.forEach(animation => animation.cancel());
  }

  private clearEntryImageUrls(): void {
    Object.values(untracked(() => this.entryImageUrls())).forEach(revokeCodexImageUrl);
    this.entryImageUrls.set({});
  }

  private setSelectedEntryImageUrl(url: string | null): void {
    revokeCodexImageUrl(untracked(() => this.selectedEntryImageUrl()));
    this.selectedEntryImageUrl.set(url);
  }

  // Filter Methods
  setNotesFilter(state: FilterTriState): void {
    this.filterNotes.set(state);
    this.applyFilters();
  }

  setDescriptionFilter(state: FilterTriState): void {
    this.filterDescription.set(state);
    this.applyFilters();
  }

  setProgressionFilter(state: FilterTriState): void {
    this.filterProgression.set(state);
    this.applyFilters();
  }

  setArchivedFilter(state: FilterTriState): void {
    this.filterArchived.set(state);
    this.applyFilters();
  }

  toggleTrackingFilter(setting: CodexTrackingSetting): void {
    const current = new Set(this.filterTracking());
    if (current.has(setting)) {
      current.delete(setting);
    } else {
      current.add(setting);
    }
    this.filterTracking.set(current);
    this.applyFilters();
  }

  hasTrackingFilter(setting: CodexTrackingSetting): boolean {
    return this.filterTracking().has(setting);
  }

  applyFilters(): void {
    this.codexStore.setEntryFilters(this.buildEntryFilters());
  }

  resetFilters(): void {
    this.filterNotes.set('any');
    this.filterDescription.set('any');
    this.filterProgression.set('any');
    this.filterArchived.set('exclude');
    this.filterTracking.set(new Set());
    this.applyFilters();
  }

  private buildEntryFilters(): CodexEntryListFiltersDto {
    const filters: CodexEntryListFiltersDto = {};
    const hasNotes = this.toBooleanFilter(this.filterNotes());
    const hasDescription = this.toBooleanFilter(this.filterDescription());
    const hasProgression = this.toBooleanFilter(this.filterProgression());
    const trackingSettings = Array.from(this.filterTracking());

    if (hasNotes !== undefined) filters.hasNotes = hasNotes;
    if (hasDescription !== undefined) filters.hasDescription = hasDescription;
    if (hasProgression !== undefined) filters.hasProgression = hasProgression;
    if (trackingSettings.length > 0) filters.trackingSettings = trackingSettings;

    switch (this.filterArchived()) {
      case 'include':
        filters.status = 'archived';
        break;
      case 'exclude':
        filters.status = 'active';
        break;
      case 'any':
        filters.includeArchived = true;
        break;
    }

    return filters;
  }

  private toBooleanFilter(state: FilterTriState): boolean | undefined {
    switch (state) {
      case 'include':
        return true;
      case 'exclude':
        return false;
      case 'any':
        return undefined;
    }
  }
}
