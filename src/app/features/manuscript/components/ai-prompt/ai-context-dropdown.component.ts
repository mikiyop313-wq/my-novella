import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewChild,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

import type { CodexEntryDto, CodexEntryType } from '../../../../../../shared/models/codex.model';
import type { ActDto, ChapterDto, SceneDto } from '../../../../../../shared/models/manuscript.model';

export interface AiContextSelection {
  includeFullOutline: boolean;
  sceneIds: string[];
  codexEntryIds: string[];
}

interface SelectionState {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
}

interface ContextChip {
  key: string;
  label: string;
  sceneIds: string[];
  codexEntryIds: string[];
  outline: boolean;
}

interface CodexCategory {
  type: CodexEntryType;
  label: string;
  entryLabel: string;
}

interface ContextSearchResult {
  key: string;
  label: string;
  path: string;
  target: 'outline' | 'scenes' | 'codex';
  ids: string[];
}

const CODEX_CATEGORIES: readonly CodexCategory[] = [
  { type: 'character', label: 'Characters', entryLabel: 'Character' },
  { type: 'location', label: 'Locations', entryLabel: 'Location' },
  { type: 'object', label: 'Objects', entryLabel: 'Object' },
  { type: 'lore', label: 'Lore', entryLabel: 'Lore' },
  { type: 'subplot', label: 'Subplots', entryLabel: 'Subplot' },
  { type: 'other', label: 'Other', entryLabel: 'Other' },
];

@Component({
  selector: 'app-ai-context-dropdown',
  standalone: true,
  imports: [CommonModule, CdkMenuModule],
  templateUrl: './ai-context-dropdown.component.html',
  styleUrl: './ai-context-dropdown.component.scss',
})
export class AiContextDropdownComponent {
  readonly hierarchy = input<readonly ActDto[]>([]);
  readonly codexEntries = input<readonly CodexEntryDto[]>([]);
  readonly includeFullOutline = input(false);
  readonly sceneIds = input<readonly string[]>([]);
  readonly codexEntryIds = input<readonly string[]>([]);
  readonly hierarchyLoading = input(false);
  readonly codexLoading = input(false);
  readonly hierarchyError = input<string | null>(null);
  readonly codexError = input<string | null>(null);

  readonly selectionChange = output<AiContextSelection>();

  @ViewChild(CdkMenuTrigger) private menuTrigger?: CdkMenuTrigger;
  @ViewChild('contextSearch') private searchInput?: ElementRef<HTMLInputElement>;

  readonly searchTerm = signal('');
  readonly menuOpen = signal(false);
  readonly codexCategories = CODEX_CATEGORIES;

  readonly activeCodexEntries = computed(() =>
    [...this.codexEntries()]
      .filter(entry => entry.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly allSceneIds = computed(() => this.scenesForActs(this.hierarchy()).map(scene => scene.id));

  readonly searchResults = computed<ContextSearchResult[]>(() => {
    const term = this.normalizedSearch();
    if (!term) return [];

    const results: ContextSearchResult[] = [];
    const allSceneIds = this.allSceneIds();

    if (this.matches('Full Outline', term)) {
      results.push({
        key: 'outline', label: 'Full Outline', path: 'Outline & Novel', target: 'outline', ids: [],
      });
    }

    if (allSceneIds.length > 0 && this.matches('Novel', term)) {
      results.push({
        key: 'novel', label: 'Novel', path: 'Outline & Novel', target: 'scenes', ids: allSceneIds,
      });
    }

    for (const act of this.hierarchy()) {
      const actLabel = act.title || 'Untitled Act';
      const actIds = this.scenesForAct(act).map(scene => scene.id);
      if (actIds.length > 0 && this.matches(actLabel, term)) {
        results.push({
          key: `act:${act.id}`, label: actLabel, path: 'Novel', target: 'scenes', ids: actIds,
        });
      }

      for (const chapter of act.chapters ?? []) {
        const chapterLabel = chapter.title || 'Untitled Chapter';
        const chapterIds = this.scenesForChapter(chapter).map(scene => scene.id);
        if (chapterIds.length > 0 && this.matches(chapterLabel, term)) {
          results.push({
            key: `chapter:${chapter.id}`,
            label: chapterLabel,
            path: `Novel / ${actLabel}`,
            target: 'scenes',
            ids: chapterIds,
          });
        }

        for (const scene of chapter.scenes ?? []) {
          const sceneLabel = scene.title || 'Untitled Scene';
          if (this.matches(sceneLabel, term)) {
            results.push({
              key: `scene:${scene.id}`,
              label: sceneLabel,
              path: `Novel / ${actLabel} / ${chapterLabel}`,
              target: 'scenes',
              ids: [scene.id],
            });
          }
        }
      }
    }

    for (const category of CODEX_CATEGORIES) {
      const entries = this.entriesForType(category.type);
      const entryIds = entries.map(entry => entry.id);
      if (entryIds.length > 0 && this.matches(category.label, term)) {
        results.push({
          key: `codex:${category.type}`,
          label: category.label,
          path: 'Codex',
          target: 'codex',
          ids: entryIds,
        });
      }

      for (const entry of entries) {
        if (this.matches(entry.name, term) || this.matches(entry.alias, term)) {
          results.push({
            key: `codex-entry:${entry.id}`,
            label: entry.name,
            path: `Codex / ${category.label}`,
            target: 'codex',
            ids: [entry.id],
          });
        }
      }
    }

    return results;
  });

  readonly chips = computed<ContextChip[]>(() => {
    const chips: ContextChip[] = [];
    const selectedScenes = new Set(this.sceneIds());
    const selectedCodex = new Set(this.codexEntryIds());
    const allSceneIds = this.allSceneIds();

    if (this.includeFullOutline()) {
      chips.push({
        key: 'outline',
        label: 'Full Outline',
        sceneIds: [],
        codexEntryIds: [],
        outline: true,
      });
    }

    if (allSceneIds.length > 0 && this.allSelected(allSceneIds, selectedScenes)) {
      chips.push(this.sceneChip('novel', 'Novel', allSceneIds));
    } else {
      for (const act of this.hierarchy()) {
        const actIds = this.scenesForAct(act).map(scene => scene.id);
        if (actIds.length > 0 && this.allSelected(actIds, selectedScenes)) {
          chips.push(this.sceneChip(`act:${act.id}`, act.title || 'Untitled Act', actIds));
          continue;
        }

        for (const chapter of act.chapters ?? []) {
          const chapterIds = this.scenesForChapter(chapter).map(scene => scene.id);
          if (chapterIds.length > 0 && this.allSelected(chapterIds, selectedScenes)) {
            chips.push(this.sceneChip(`chapter:${chapter.id}`, chapter.title || 'Untitled Chapter', chapterIds));
            continue;
          }

          for (const scene of chapter.scenes ?? []) {
            if (selectedScenes.has(scene.id)) {
              chips.push(this.sceneChip(`scene:${scene.id}`, scene.title || 'Untitled Scene', [scene.id]));
            }
          }
        }
      }
    }

    for (const category of CODEX_CATEGORIES) {
      const entries = this.entriesForType(category.type);
      const ids = entries.map(entry => entry.id);
      if (ids.length > 0 && this.allSelected(ids, selectedCodex)) {
        chips.push(this.codexChip(`codex:${category.type}`, category.label, ids));
        continue;
      }

      for (const entry of entries) {
        if (selectedCodex.has(entry.id)) {
          chips.push(this.codexChip(`codex-entry:${entry.id}`, entry.name, [entry.id]));
        }
      }
    }

    return chips;
  });

  onMenuOpened(): void {
    this.menuOpen.set(true);
    setTimeout(() => this.searchInput?.nativeElement.focus());
  }

  onMenuClosed(): void {
    this.menuOpen.set(false);
    this.searchTerm.set('');
  }

  closeMenu(): void {
    this.menuTrigger?.close();
  }

  updateSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  clearSearch(event: MouseEvent): void {
    event.stopPropagation();
    this.searchTerm.set('');
    this.searchInput?.nativeElement.focus();
  }

  toggleOutline(): void {
    this.emitSelection({ includeFullOutline: !this.includeFullOutline() });
  }

  toggleScenes(ids: readonly string[]): void {
    this.emitSelection({ sceneIds: this.toggleIds(this.sceneIds(), ids) });
  }

  toggleCodex(ids: readonly string[]): void {
    this.emitSelection({ codexEntryIds: this.toggleIds(this.codexEntryIds(), ids) });
  }

  toggleSearchResult(result: ContextSearchResult): void {
    if (result.target === 'outline') {
      this.toggleOutline();
    } else if (result.target === 'scenes') {
      this.toggleScenes(result.ids);
    } else {
      this.toggleCodex(result.ids);
    }
  }

  searchResultState(result: ContextSearchResult): SelectionState {
    if (result.target === 'outline') {
      return {
        checked: this.includeFullOutline(),
        indeterminate: false,
        disabled: false,
      };
    }
    return result.target === 'scenes'
      ? this.sceneState(result.ids)
      : this.codexState(result.ids);
  }

  removeChip(chip: ContextChip, event: Event): void {
    event.stopPropagation();
    if (chip.outline) {
      this.emitSelection({ includeFullOutline: false });
      return;
    }

    this.emitSelection({
      sceneIds: this.removeIds(this.sceneIds(), chip.sceneIds),
      codexEntryIds: this.removeIds(this.codexEntryIds(), chip.codexEntryIds),
    });
  }

  sceneState(ids: readonly string[]): SelectionState {
    return this.selectionState(ids, this.sceneIds());
  }

  codexState(ids: readonly string[]): SelectionState {
    return this.selectionState(ids, this.codexEntryIds());
  }

  ariaChecked(state: SelectionState): 'true' | 'false' | 'mixed' {
    return state.indeterminate ? 'mixed' : state.checked ? 'true' : 'false';
  }

  scenesForAct(act: ActDto): SceneDto[] {
    return this.scenesForChapters(act.chapters ?? []);
  }

  scenesForChapter(chapter: ChapterDto): SceneDto[] {
    return [...(chapter.scenes ?? [])];
  }

  entriesForType(type: CodexEntryType): CodexEntryDto[] {
    return this.activeCodexEntries().filter(entry => entry.type === type);
  }

  actVisible(act: ActDto): boolean {
    const term = this.normalizedSearch();
    if (!term || this.matches(act.title, term)) return true;
    return (act.chapters ?? []).some(chapter => this.chapterVisible(chapter));
  }

  chapterVisible(chapter: ChapterDto): boolean {
    const term = this.normalizedSearch();
    if (!term || this.matches(chapter.title, term)) return true;
    return (chapter.scenes ?? []).some(scene => this.sceneVisible(scene));
  }

  sceneVisible(scene: SceneDto): boolean {
    const term = this.normalizedSearch();
    return !term || this.matches(scene.title, term);
  }

  categoryVisible(category: CodexCategory): boolean {
    const term = this.normalizedSearch();
    if (!term || this.matches(category.label, term)) return true;
    return this.entriesForType(category.type).some(entry => this.entryVisible(entry));
  }

  entryVisible(entry: CodexEntryDto): boolean {
    const term = this.normalizedSearch();
    return !term || this.matches(entry.name, term) || this.matches(entry.alias, term);
  }

  hasSearchResults(): boolean {
    return this.searchResults().length > 0;
  }

  categoryLabel(type: CodexEntryType): string {
    return CODEX_CATEGORIES.find(category => category.type === type)?.label ?? 'Other';
  }

  private emitSelection(changes: Partial<AiContextSelection>): void {
    this.selectionChange.emit({
      includeFullOutline: changes.includeFullOutline ?? this.includeFullOutline(),
      sceneIds: changes.sceneIds ?? [...new Set(this.sceneIds())],
      codexEntryIds: changes.codexEntryIds ?? [...new Set(this.codexEntryIds())],
    });
  }

  private selectionState(ids: readonly string[], selectedIds: readonly string[]): SelectionState {
    const selected = new Set(selectedIds);
    const selectedCount = ids.reduce((count, id) => count + Number(selected.has(id)), 0);
    return {
      checked: ids.length > 0 && selectedCount === ids.length,
      indeterminate: selectedCount > 0 && selectedCount < ids.length,
      disabled: ids.length === 0,
    };
  }

  private toggleIds(current: readonly string[], target: readonly string[]): string[] {
    if (target.length === 0) return [...new Set(current)];
    const next = new Set(current);
    const remove = target.every(id => next.has(id));
    target.forEach(id => remove ? next.delete(id) : next.add(id));
    return [...next];
  }

  private removeIds(current: readonly string[], removed: readonly string[]): string[] {
    const removedSet = new Set(removed);
    return [...new Set(current)].filter(id => !removedSet.has(id));
  }

  private allSelected(ids: readonly string[], selected: ReadonlySet<string>): boolean {
    return ids.every(id => selected.has(id));
  }

  private scenesForActs(acts: readonly ActDto[]): SceneDto[] {
    return acts.flatMap(act => this.scenesForAct(act));
  }

  private scenesForChapters(chapters: readonly ChapterDto[]): SceneDto[] {
    return chapters.flatMap(chapter => this.scenesForChapter(chapter));
  }

  private sceneChip(key: string, label: string, sceneIds: string[]): ContextChip {
    return { key, label, sceneIds, codexEntryIds: [], outline: false };
  }

  private codexChip(key: string, label: string, codexEntryIds: string[]): ContextChip {
    return { key, label, sceneIds: [], codexEntryIds, outline: false };
  }

  private normalizedSearch(): string {
    return this.searchTerm().trim().toLocaleLowerCase();
  }

  private matches(value: string | null | undefined, term: string): boolean {
    return value?.toLocaleLowerCase().includes(term) ?? false;
  }
}
