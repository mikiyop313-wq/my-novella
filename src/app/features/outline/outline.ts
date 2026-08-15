import { Component, DestroyRef, ElementRef, HostListener, NgZone, OnInit, QueryList, ViewChild, ViewChildren, computed, inject, signal, ChangeDetectorRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { MarkdownComponent } from 'ngx-markdown';

import {
  ActDto,
  ChapterDto,
  ManuscriptMode,
  SceneDto,
  TiptapJsonDoc,
  UpdateStructurePositionsPayload,
} from '../../../../shared/models/manuscript.model';
import type { DetectedCodexEntryDto } from '../../../../shared/models/codex.model';
import type { SystemPromptCategory } from '../../../../shared/models/system-prompt.model';

import { ToastService } from '../../shared/services/toast.service';
import { AiStreamService } from '../../core/services/ai-stream.service';
import { ElectronService } from '../../core/services/electron.service';
import { ElementAnimationDirective } from '../../shared/directives/element-animation.directive';
import { OverlayModalDirective } from '../../shared/directives/overlay-modal.directive';
import { MarkdownEditorComponent } from '../../shared/components/markdown-editor/markdown-editor.component';
import { buildPromptSection } from '../../shared/utils/ai-prompt-builder';
import { serializeTiptapDocument } from '../../shared/utils/story-context-builder';
import { AutocompleteKeepOpenMenuItemDirective } from '../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import {
  SystemPromptModelService,
  type SystemPromptModelResolution,
} from '../../shared/services/system-prompt-model.service';
import {
  CodexDetectionModalComponent,
  type CodexDetectionSaveResult,
} from '../codex/components/codex-detection-modal/codex-detection-modal.component';
import { CodexContextHighlightDirective } from '../codex/highlighting/codex-context-highlight.directive';
import { CodexService } from '../codex/services/codex.service';
import { CodexContextTrieService } from '../codex/services/codex-context-trie.service';
import { CodexStore } from '../codex/store/codex.store';
import {
  filterNewCodexEntries,
  parseCodexDetectionResponse,
} from '../codex/utils/codex-detection-response';
import { buildCodexDetectionPrompt } from '../codex/utils/codex-detection-prompt';
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
  imports: [
    DragDropModule,
    DecimalPipe,
    CdkMenuModule,
    ElementAnimationDirective,
    MarkdownComponent,
    MarkdownEditorComponent,
    AutocompleteKeepOpenMenuItemDirective,
    CodexContextHighlightDirective,
    CodexDetectionModalComponent,
    OverlayModalDirective,
  ],
  templateUrl: './outline.html',
  styleUrl: './outline.scss',
})
export class Outline implements OnInit {
  // Store and services.
  readonly store = inject(OutlineStore);

  private readonly elementRef = inject(ElementRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toastService = inject(ToastService);
  private readonly aiStreamService = inject(AiStreamService);
  private readonly systemPromptModelService = inject(SystemPromptModelService);
  private readonly electronService = inject(ElectronService);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly codexService = inject(CodexService);
  private readonly codexStore = inject(CodexStore);
  private readonly codexContextTrie = inject(CodexContextTrieService);

  @ViewChild('outlineAnimation') private outlineAnimation?: ElementAnimationDirective;
  @ViewChild('codexDetectionModalTrigger')
  private codexDetectionModalTrigger?: OverlayModalDirective;
  @ViewChildren(CdkMenuTrigger) private menuTriggers!: QueryList<CdkMenuTrigger>;

  // Local UI state for collapsed sections and inline title/comment editing.
  collapsed = signal<Record<string, boolean>>({});
  editing = signal<Record<string, boolean>>({});
  sceneSummaryDrafts = signal<Record<string, string>>({});
  sceneCardMode = signal<'compact' | 'fit' | 'list'>('compact');
  summaryModelResolution = signal<SystemPromptModelResolution | null>(null);
  codexDetectionModelResolution = signal<SystemPromptModelResolution | null>(null);
  resolvingSummaryModel = signal(false);
  generatingSummarySceneId = signal<string | null>(null);
  generatingCodexDetectionSceneId = signal<string | null>(null);
  detectedCodexEntries = signal<DetectedCodexEntryDto[]>([]);
  readonly sceneAiMenuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: 4 },
    { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom', offsetX: 4 },
    { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top', offsetX: -4 },
    { originX: 'start', originY: 'bottom', overlayX: 'end', overlayY: 'bottom', offsetX: -4 },
  ];

  // ---------------------------------------------------------------------------
  // View State
  // ---------------------------------------------------------------------------

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target) return;

    // If no item is currently being edited, nothing to dismiss.
    const editingState = this.editing();
    const hasEditing = Object.values(editingState).some(Boolean);
    if (!hasEditing) return;

    // Keep editing if the click landed on an edit input or textarea inside this component.
    const isEditField = target.closest(
      '.act-title-input, .chapter-title-input, .scene-title-input, .scene-summary-input',
    );
    if (isEditField && this.elementRef.nativeElement.contains(target)) return;

    // Keep editing if the click landed inside a CDK overlay (menu).
    // Menus render outside the component tree, and their own handlers (e.g. toggleEdit)
    // manage editing state directly.
    if (target.closest('.cdk-overlay-container')) return;

    // Dismiss editing for any click on buttons, menus, menu items, overlays, or outside the edit fields.
    this.clearAllEditing();
  }

  clearAllEditing(): void {
    this.editing.set({});
  }

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

  setSceneCardMode(mode: 'compact' | 'fit' | 'list'): void {
    if (this.sceneCardMode() === mode) return;

    if (!document.startViewTransition) {
      this.sceneCardMode.set(mode);
      return;
    }

    document.startViewTransition(() => {
      this.sceneCardMode.set(mode);
      this.cdr.detectChanges();
    });
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

    this.ngZone.runOutsideAngular(() => {
      const handleScroll = (): void => {
        const hasOpenMenu = this.menuTriggers.some((trigger) => trigger.isOpen());
        if (hasOpenMenu) {
          this.ngZone.run(() => {
            this.closeAllMenus();
          });
        }
      };

      window.addEventListener('scroll', handleScroll, true);

      this.destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', handleScroll, true);
      });
    });
  }

  closeAllMenus(): void {
    this.menuTriggers.forEach((trigger) => {
      if (trigger.isOpen()) {
        trigger.close();
      }
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
  async createInitialStructure(bookId: string): Promise<void> {
    const action = async (): Promise<void> => {
      const previousActIds = new Set(this.store.bookHierarchy().map((act) => act.id));
      await this.store.createAct(bookId);
      const actId = this.store.bookHierarchy().find((act) => !previousActIds.has(act.id))?.id;
      if (!actId) return;

      const previousChapterIds = new Set((this.findAct(actId)?.chapters ?? []).map((chapter) => chapter.id));
      await this.store.createChapter(actId);
      const chapterId = (this.findAct(actId)?.chapters ?? []).find(
        (chapter) => !previousChapterIds.has(chapter.id),
      )?.id;
      if (!chapterId) return;

      await this.store.createScene(chapterId);
      this.cdr.detectChanges();
    };

    try {
      await (this.outlineAnimation
        ? this.outlineAnimation.animateAfterCreate(action)
        : action());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create initial structure.';
      this.toastService.error(message, 'Outline');
    }
  }

  async createAct(bookId: string): Promise<void> {
    const previousIds = new Set(this.store.bookHierarchy().map((act) => act.id));
    let createdId: string | undefined;
    const action = async (): Promise<void> => {
      await this.store.createAct(bookId);
      createdId = this.store.bookHierarchy().find((act) => !previousIds.has(act.id))?.id;
      this.cdr.detectChanges();
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
      this.cdr.detectChanges();
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
      this.cdr.detectChanges();
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
        ? this.outlineAnimation.animateBeforeDelete(element, async () => {
            await this.store.deleteAct(actId);
            this.cdr.detectChanges();
          })
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
        ? this.outlineAnimation.animateBeforeDelete(element, async () => {
            await this.store.deleteChapter(chapterId);
            this.cdr.detectChanges();
          })
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
        ? this.outlineAnimation.animateBeforeDelete(element, async () => {
            await this.store.deleteScene(sceneId);
            this.cdr.detectChanges();
          })
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
        ? this.outlineAnimation.animateBeforeDelete(element, async () => {
            await this.store.archiveAct(actId);
            this.cdr.detectChanges();
          })
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
        ? this.outlineAnimation.animateBeforeDelete(element, async () => {
            await this.store.archiveChapter(chapterId);
            this.cdr.detectChanges();
          })
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
        ? this.outlineAnimation.animateBeforeDelete(element, async () => {
            await this.store.archiveScene(sceneId);
            this.cdr.detectChanges();
          })
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
    const keepEditing = this.shouldKeepEditing(event);
    const nextSummary = this.normalizeEditableValue(summary);
    const currentSummary = this.findScene(sceneId)?.summary ?? '';

    if (currentSummary === nextSummary) {
      this.clearSceneSummaryDraft(sceneId);
      this.setSceneEditing(sceneId, keepEditing);
      return;
    }

    try {
      await this.store.updateScene({ id: sceneId, summary: nextSummary });
      this.clearSceneSummaryDraft(sceneId);
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

  isSceneEmpty(sceneId: string): boolean {
    const scene = this.findScene(sceneId);
    if (!scene) return true;

    const hasSummary = !!scene.summary && scene.summary.trim().length > 0;
    const hasProse = (scene.wordCount ?? 0) > 0;

    return !hasSummary && !hasProse;
  }

  sceneSummaryValue(scene: SceneDto): string {
    return this.sceneSummaryDrafts()[scene.id] ?? scene.summary ?? '';
  }

  updateSceneSummaryDraft(sceneId: string, summary: string): void {
    this.sceneSummaryDrafts.update((drafts) => ({
      ...drafts,
      [sceneId]: summary,
    }));
  }

  async prepareSceneAiMenu(): Promise<void> {
    const bookId = this.store.bookId();
    this.summaryModelResolution.set(null);
    this.codexDetectionModelResolution.set(null);
    if (!bookId) return;

    this.resolvingSummaryModel.set(true);
    try {
      const [summaryModel, codexDetectionModel] = await Promise.all([
        this.resolveSceneAiModel(bookId, 'summary'),
        this.resolveSceneAiModel(bookId, 'codexDetection'),
      ]);
      this.summaryModelResolution.set(summaryModel);
      this.codexDetectionModelResolution.set(codexDetectionModel);
    } finally {
      this.resolvingSummaryModel.set(false);
      setTimeout(() => {
        document.querySelector<HTMLButtonElement>(
          '.scene-ai-menu .scene-summary-generate',
        )?.focus();
      });
    }
  }

  hasSceneProse(sceneId: string): boolean {
    return (this.findScene(sceneId)?.wordCount ?? 0) > 0;
  }

  isGeneratingSceneSummary(sceneId: string): boolean {
    return this.generatingSummarySceneId() === sceneId;
  }

  isSceneSummaryGenerationDisabled(sceneId: string): boolean {
    return !this.hasSceneProse(sceneId)
      || this.resolvingSummaryModel()
      || this.summaryModelResolution()?.status !== 'ready'
      || this.generatingSummarySceneId() !== null
      || this.generatingCodexDetectionSceneId() !== null;
  }

  summaryModelGuidance(): string {
    const resolution = this.summaryModelResolution();
    return resolution?.status === 'unavailable'
      && resolution.reason === 'openrouter-unconfigured'
      ? 'Configure OpenRouter in Settings'
      : 'Choose a model in System Prompts';
  }

  openSummaryModelSettings(): void {
    const bookId = this.store.bookId();
    if (!bookId) return;
    const resolution = this.summaryModelResolution();
    const section = resolution?.status === 'unavailable'
      && resolution.reason === 'openrouter-unconfigured'
      ? 'ai-configuration'
      : 'system-prompts';
    void this.router.navigate(['/workspace', bookId, 'settings'], {
      state: { settingsSection: section },
    });
  }

  isGeneratingCodexDetection(sceneId: string): boolean {
    return this.generatingCodexDetectionSceneId() === sceneId;
  }

  isCodexDetectionDisabled(sceneId: string): boolean {
    return !this.hasSceneProse(sceneId)
      || this.resolvingSummaryModel()
      || this.codexDetectionModelResolution()?.status !== 'ready'
      || this.generatingCodexDetectionSceneId() !== null
      || this.generatingSummarySceneId() !== null;
  }

  codexDetectionModelGuidance(): string {
    const resolution = this.codexDetectionModelResolution();
    return resolution?.status === 'unavailable'
      && resolution.reason === 'openrouter-unconfigured'
      ? 'Configure OpenRouter in Settings'
      : 'Choose a Codex Detection model in System Prompts';
  }

  openCodexDetectionModelSettings(): void {
    const bookId = this.store.bookId();
    if (!bookId) return;
    const resolution = this.codexDetectionModelResolution();
    const section = resolution?.status === 'unavailable'
      && resolution.reason === 'openrouter-unconfigured'
      ? 'ai-configuration'
      : 'system-prompts';
    void this.router.navigate(['/workspace', bookId, 'settings'], {
      state: { settingsSection: section },
    });
  }

  async detectCodexEntries(sceneId: string): Promise<void> {
    if (this.isCodexDetectionDisabled(sceneId)) return;

    const bookId = this.store.bookId();
    const selectedModel = this.codexDetectionModelResolution();
    if (!bookId || selectedModel?.status !== 'ready') return;

    this.generatingCodexDetectionSceneId.set(sceneId);
    try {
      const [proseBySceneId, existingEntries] = await Promise.all([
        this.electronService.invoke(
          'manuscript:getScenesProse',
          { sceneIds: [sceneId] },
        ) as Promise<Record<string, TiptapJsonDoc | null>>,
        this.codexService.getEntries(bookId, { includeArchived: true }),
      ]);
      const prose = serializeTiptapDocument(proseBySceneId[sceneId] ?? null);
      if (!prose) {
        this.toastService.error('The scene has no prose to scan.', 'Codex Detection');
        return;
      }

      const response = await this.aiStreamService.streamText({
        streamId: `outline-codex-detection:${sceneId}`,
        bookId,
        systemPromptCategory: 'codexDetection',
        prompt: buildCodexDetectionPrompt({ prose, existingEntries }),
        provider: selectedModel.provider,
        modelId: selectedModel.modelId,
      });
      const entries = filterNewCodexEntries({
        detectedEntries: parseCodexDetectionResponse(response),
        existingEntries,
      });

      if (entries.length === 0) {
        this.toastService.info('No new Codex entries were detected.', 'Codex Detection');
        return;
      }

      this.detectedCodexEntries.set(entries);
      this.closeAllMenus();
      this.codexDetectionModalTrigger?.openModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Codex detection failed.';
      this.toastService.error(message, 'Codex Detection');
    } finally {
      this.generatingCodexDetectionSceneId.set(null);
      this.closeAllMenus();
    }
  }

  readonly saveDetectedCodexEntry = async (
    entry: DetectedCodexEntryDto,
  ): Promise<CodexDetectionSaveResult> => {
    const bookId = this.store.bookId();
    if (!bookId) {
      return { success: false, error: 'Failed to add the Codex entry.' };
    }

    try {
      await this.codexService.createEntry({
        bookId,
        type: entry.type,
        name: entry.name,
        description: entry.description,
        trackingSetting: 'include_when_detected',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add the Codex entry.';
      return { success: false, error: message };
    }

    await this.codexStore.loadEntries(
      bookId,
      this.codexStore.activeType(),
      this.codexStore.searchQuery().trim(),
      this.codexStore.entryFilters(),
    );
    try {
      await this.codexContextTrie.refreshCurrentContext();
    } catch (error) {
      console.error('Failed to refresh Codex context after detection:', error);
    }
    return { success: true };
  };

  async generateSceneSummary(sceneId: string): Promise<void> {
    if (this.isSceneSummaryGenerationDisabled(sceneId)) return;

    const bookId = this.store.bookId();
    const selectedModel = this.summaryModelResolution();
    if (!bookId || selectedModel?.status !== 'ready') return;

    this.generatingSummarySceneId.set(sceneId);

    try {
      let proseDocument: TiptapJsonDoc | null;
      try {
        const proseBySceneId = await this.electronService.invoke(
          'manuscript:getScenesProse',
          { sceneIds: [sceneId] },
        ) as Record<string, TiptapJsonDoc | null>;
        proseDocument = proseBySceneId[sceneId] ?? null;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load scene prose.';
        this.toastService.error(message, 'Outline');
        return;
      }

      const prose = serializeTiptapDocument(proseDocument);
      if (!prose) {
        this.toastService.error('The scene has no prose to summarize.', 'Outline');
        return;
      }

      let generatedSummary: string;
      try {
        generatedSummary = await this.aiStreamService.streamText({
          streamId: `outline-scene-summary:${sceneId}`,
          bookId,
          systemPromptCategory: 'summary',
          prompt: buildPromptSection({ name: 'SCENE PROSE', content: prose }),
          provider: selectedModel.provider,
          modelId: selectedModel.modelId,
        });
      } catch (error) {
        console.error('Failed to generate scene summary:', error);
        return;
      }

      const summary = generatedSummary.trim();
      if (!summary) {
        this.toastService.error('AI returned an empty scene summary.', 'Outline');
        return;
      }

      try {
        await this.store.updateScene({ id: sceneId, summary });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save scene summary.';
        this.toastService.error(message, 'Outline');
      }
    } finally {
      this.generatingSummarySceneId.set(null);
      this.closeAllMenus();
    }
  }

  private async resolveSceneAiModel(
    bookId: string,
    category: Extract<SystemPromptCategory, 'summary' | 'codexDetection'>,
  ): Promise<SystemPromptModelResolution> {
    try {
      return await this.systemPromptModelService.resolveActiveModel(bookId, category);
    } catch (error) {
      console.error(`Failed to resolve the ${category} model:`, error);
      return { status: 'unavailable', selectorId: null, reason: 'missing-model' };
    }
  }

  private normalizeEditableValue(value: string): string {
    return value.trim().length === 0 ? '' : value;
  }

  private setSceneEditing(sceneId: string, keepEditing: boolean): void {
    this.editing.update((state) => ({ ...state, [sceneId]: keepEditing }));
  }

  private clearSceneSummaryDraft(sceneId: string): void {
    this.sceneSummaryDrafts.update((drafts) => {
      if (!(sceneId in drafts)) return drafts;

      const nextDrafts = { ...drafts };
      delete nextDrafts[sceneId];
      return nextDrafts;
    });
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
