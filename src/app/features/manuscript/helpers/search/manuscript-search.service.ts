import { Injectable, computed, inject, signal } from '@angular/core';
import type { Editor } from '@tiptap/core';

import type { ManuscriptDataDto, ManuscriptMode } from '../../../../../../shared/models/manuscript.model';
import { ElectronService } from '../../../../core/services/electron.service';
import {
  clearManuscriptSearchDecorations,
  setManuscriptSearchDecorations,
} from '../../extensions/manuscript-search.extension';
import {
  getManuscriptScenes,
  type ManuscriptSearchMatch,
  type ManuscriptSearchOptions,
  mergeLiveSearchMatches,
  searchEditorProse,
  searchManuscriptData,
} from './manuscript-search.utils';

@Injectable()
export class ManuscriptSearchService {
  private readonly electronService = inject(ElectronService);

  private editor: Editor | null = null;
  private currentScopeData: ManuscriptDataDto | null = null;
  private wholeManuscriptData: ManuscriptDataDto | null = null;
  private wholeManuscriptBookId: string | null = null;
  private wholeSearchLoadPromise: Promise<void> | null = null;
  private pendingMatchKey: string | null = null;

  readonly open = signal(false);
  readonly query = signal('');
  readonly wholeManuscript = signal(false);
  readonly matchCase = signal(false);
  readonly wholeWord = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly matches = signal<ManuscriptSearchMatch[]>([]);
  readonly activeMatchIndex = signal(-1);
  readonly currentMatchNumber = computed(() => (
    this.activeMatchIndex() >= 0 ? this.activeMatchIndex() + 1 : 0
  ));

  attachEditor(editor: Editor): void {
    this.editor = editor;
  }

  detachEditor(): void {
    if (this.editor && !this.editor.isDestroyed) clearManuscriptSearchDecorations(this.editor);
    this.editor = null;
  }

  setCurrentScopeData(data: ManuscriptDataDto | null): void {
    this.currentScopeData = data;
  }

  currentScopeContainsScene(sceneId: string): boolean {
    return !!this.currentScopeData
      && getManuscriptScenes(this.currentScopeData).some(scene => scene.id === sceneId);
  }

  invalidateWholeManuscriptData(bookId?: string): void {
    if (bookId && this.wholeManuscriptBookId === bookId) return;
    this.wholeManuscriptData = null;
    this.wholeManuscriptBookId = null;
  }

  show(): void {
    this.open.set(true);
  }

  close(): void {
    if (this.editor && !this.editor.isDestroyed) clearManuscriptSearchDecorations(this.editor);
    this.open.set(false);
    this.query.set('');
    this.wholeManuscript.set(false);
    this.matchCase.set(false);
    this.wholeWord.set(false);
    this.loading.set(false);
    this.error.set(null);
    this.matches.set([]);
    this.activeMatchIndex.set(-1);
    this.wholeManuscriptData = null;
    this.wholeManuscriptBookId = null;
    this.pendingMatchKey = null;
  }

  updateQuery(query: string): void {
    this.query.set(query);
    this.pendingMatchKey = null;
    this.refresh({ preserveActiveMatch: false });
  }

  updateMatchCase(matchCase: boolean): void {
    this.matchCase.set(matchCase);
    this.refresh({ preserveActiveMatch: false });
  }

  updateWholeWord(wholeWord: boolean): void {
    this.wholeWord.set(wholeWord);
    this.refresh({ preserveActiveMatch: false });
  }

  async updateScope({
    wholeManuscript,
    bookId,
    mode,
  }: {
    wholeManuscript: boolean;
    bookId: string | null;
    mode: ManuscriptMode | null;
  }): Promise<void> {
    this.wholeManuscript.set(wholeManuscript);
    this.pendingMatchKey = null;

    if (wholeManuscript) await this.loadWholeManuscriptData({ bookId, mode });
    else this.error.set(null);
    this.refresh({ preserveActiveMatch: false });
  }

  async retryWholeManuscript({
    bookId,
    mode,
  }: {
    bookId: string | null;
    mode: ManuscriptMode | null;
  }): Promise<void> {
    this.wholeManuscriptData = null;
    await this.loadWholeManuscriptData({ bookId, mode });
    this.refresh({ preserveActiveMatch: false });
  }

  async reloadWholeManuscript({
    bookId,
    mode,
  }: {
    bookId: string;
    mode: ManuscriptMode | null;
  }): Promise<void> {
    this.wholeManuscriptData = null;
    this.wholeManuscriptBookId = null;
    await this.loadWholeManuscriptData({ bookId, mode });
  }

  refresh({ preserveActiveMatch }: { preserveActiveMatch: boolean }): void {
    if (!this.editor || this.editor.isDestroyed || !this.open()) return;

    const data = this.wholeManuscript() ? this.wholeManuscriptData : this.currentScopeData;
    const options = this.options();
    const previousMatches = this.matches();
    const previousIndex = this.activeMatchIndex();
    const activeKey = this.pendingMatchKey
      ?? (preserveActiveMatch && previousIndex >= 0
        ? searchMatchKey(previousMatches[previousIndex])
        : null);

    if (!data || !options.query) {
      this.matches.set([]);
      this.activeMatchIndex.set(-1);
      clearManuscriptSearchDecorations(this.editor);
      return;
    }

    const liveResult = searchEditorProse(this.editor, options);
    const matches = mergeLiveSearchMatches({
      data,
      dataMatches: searchManuscriptData(data, options),
      liveResult,
    });
    let activeIndex = activeKey
      ? matches.findIndex(match => searchMatchKey(match) === activeKey)
      : -1;
    if (activeIndex < 0 && matches.length > 0) activeIndex = 0;

    this.matches.set(matches);
    this.activeMatchIndex.set(activeIndex);
    if (activeIndex >= 0 && matches[activeIndex].from !== undefined) this.pendingMatchKey = null;
    this.updateDecorations();
  }

  select(direction: -1 | 1): ManuscriptSearchMatch | null {
    const matches = this.matches();
    if (matches.length === 0) return null;

    const currentIndex = this.activeMatchIndex();
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + matches.length) % matches.length;
    this.activeMatchIndex.set(nextIndex);
    this.pendingMatchKey = searchMatchKey(matches[nextIndex]);
    this.updateDecorations();
    return matches[nextIndex];
  }

  activeMatch(): ManuscriptSearchMatch | null {
    const index = this.activeMatchIndex();
    return index >= 0 ? this.matches()[index] ?? null : null;
  }

  clearPendingMatch(): void {
    this.pendingMatchKey = null;
  }

  private options(): ManuscriptSearchOptions {
    return {
      query: this.query(),
      matchCase: this.matchCase(),
      wholeWord: this.wholeWord(),
    };
  }

  private async loadWholeManuscriptData({
    bookId,
    mode,
  }: {
    bookId: string | null;
    mode: ManuscriptMode | null;
  }): Promise<void> {
    if (this.wholeManuscriptData || this.wholeSearchLoadPromise) {
      await this.wholeSearchLoadPromise;
      return;
    }
    if (!bookId) {
      this.error.set('Whole manuscript search is unavailable.');
      return;
    }
    if (mode === 'book' && this.currentScopeData) {
      this.wholeManuscriptData = this.currentScopeData;
      this.wholeManuscriptBookId = bookId;
      this.error.set(null);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.wholeSearchLoadPromise = (async () => {
      try {
        this.wholeManuscriptData = await this.electronService.invoke(
          'manuscript:get',
          { mode: 'book', id: bookId },
        ) as ManuscriptDataDto;
        this.wholeManuscriptBookId = bookId;
      } catch (error) {
        console.error('Failed to load whole manuscript search data:', error);
        if (this.wholeManuscript()) this.error.set('Could not search the whole manuscript.');
      } finally {
        this.loading.set(false);
        this.wholeSearchLoadPromise = null;
      }
    })();

    await this.wholeSearchLoadPromise;
  }

  private updateDecorations(): void {
    if (!this.editor || this.editor.isDestroyed) return;
    const matches = this.matches();
    const activeIndex = this.activeMatchIndex();
    setManuscriptSearchDecorations({
      editor: this.editor,
      matches,
      activeMatch: activeIndex >= 0 ? matches[activeIndex] : null,
    });
  }
}

function searchMatchKey(match: ManuscriptSearchMatch | undefined): string | null {
  return match
    ? `${match.sceneId}:${match.blockIndex}:${match.fromOffset}:${match.toOffset}`
    : null;
}
