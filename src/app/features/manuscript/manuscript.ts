import { CommonModule } from '@angular/common';
import { CdkMenuModule } from '@angular/cdk/menu';
import { Component, HostListener, Injector, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { TiptapEditorDirective } from 'ngx-tiptap';

import {
  AutocompleteDropdownComponent,
  DropdownOption,
} from '../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { ElectronService } from '../../core/services/electron.service';
import { ThemeService } from '../../core/services/theme.service';
import { ManuscriptMode } from '../../../../shared/models/manuscript.model';
import { AiGeneratedBlockExtension } from './components/ai-generated-block/ai-generated-block.extension';
import { AiPromptExtension } from './components/ai-prompt/ai-node-extension';
import { EditorBubbleMenuComponent } from './components/editor-bubble-menu/editor-bubble-menu.component';
import { ManuscriptIndexItem, ManuscriptIndexScrollComponent } from './components/manuscript-index-scroll/manuscript-index-scroll.component';
import { ActHeaderExtension, ChapterHeaderExtension } from './components/manuscript-header/manuscript-header.extension';
import {
  ProseGenerationFocusRequest,
  ProseGenerationWidgetComponent,
} from './components/prose-generation-widget/prose-generation-widget.component';
import { SceneHeaderComponent } from './components/scene/scene-header/scene-header.component';
import { SceneSkeletonExtension } from './components/scene/scene-skeleton/scene-skeleton.extension';
import { SceneSummaryExtension } from './components/scene/scene-summary/scene-summary.extension';
import { ManuscriptSearchComponent } from './components/manuscript-search/manuscript-search.component';
import {
  SLASH_COMMAND_MENU_ITEMS,
  SlashCommandMenuComponent,
  type SlashCommandMenuPosition,
} from './components/slash-command-menu/slash-command-menu.component';
import {
  isPositionInsideSceneProse,
  ManuscriptEditingGuardExtension,
} from './extensions/manuscript-editing-guard.extension';
import { UniqueIdExtension } from './extensions/unique-id.extension';
import { ManuscriptSearchExtension } from './extensions/manuscript-search.extension';
import {
  dismissSlashCommandMenu,
  selectSlashCommand,
  SlashCommandMenuExtension,
  type SlashCommand,
  type SlashCommandMenuAnchor,
} from './extensions/slash-command-menu.extension';
import {
  buildEditorContentLazy,
  extractManuscriptHierarchyById,
  extractTextFromManuscriptData,
} from './helpers/content/manuscript-content.utils';
import { ManuscriptProseSaverService } from './helpers/saving/manuscript-prose-saver.service';
import { ManuscriptParagraphVectorSyncService } from './helpers/saving/manuscript-paragraph-vector-sync.service';
import { AiStore } from '../../core/store/ai.store';
import { CodexContextHighlightDirective } from '../codex/highlighting/codex-context-highlight.directive';
import { ManuscriptStore } from './store/manuscript.store';
import { AiStreamEditorService } from './helpers/ai/ai-stream-editor.service';
import { AiSelectionEditService } from './helpers/ai/ai-selection-edit.service';
import { ToastService } from '../../shared/services/toast.service';
import { MarkdownPlainTextPipe } from '../../shared/pipes/markdown-plain-text.pipe';
import { ManuscriptSearchService } from './helpers/search/manuscript-search.service';

@Component({
  selector: 'app-manuscript',
  standalone: true,
  imports: [
    CommonModule,
    TiptapEditorDirective,
    AutocompleteDropdownComponent,
    EditorBubbleMenuComponent,
    CdkMenuModule,
    ManuscriptIndexScrollComponent,
    ProseGenerationWidgetComponent,
    SceneHeaderComponent,
    CodexContextHighlightDirective,
    MarkdownPlainTextPipe,
    ManuscriptSearchComponent,
    SlashCommandMenuComponent,
  ],
  templateUrl: './manuscript.html',
  styleUrl: './manuscript.scss',
  providers: [ManuscriptSearchService],
})
export class Manuscript implements OnInit, OnDestroy {

  @ViewChild(EditorBubbleMenuComponent)
  private editorBubbleMenu!: EditorBubbleMenuComponent;

  @ViewChild(ManuscriptSearchComponent)
  private manuscriptSearchWidget?: ManuscriptSearchComponent;

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  readonly store = inject(ManuscriptStore);
  readonly aiStore = inject(AiStore);
  readonly themeService = inject(ThemeService);
  readonly electronService = inject(ElectronService);
  readonly paragraphVectorSync = inject(ManuscriptParagraphVectorSyncService);
  readonly search = inject(ManuscriptSearchService);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly saver = inject(ManuscriptProseSaverService);
  private readonly aiStreamEditor = inject(AiStreamEditorService);
  private readonly selectionEdits = inject(AiSelectionEditService);
  private readonly toastService = inject(ToastService);


  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  editor: Editor | undefined;

  indexItems = signal<ManuscriptIndexItem[]>([]);
  hasLoadedContent = signal(false);
  hasActNodes = signal(false);
  hasChapterNodes = signal(false);
  hasSceneNodes = signal(false);
  private isNavigatingAfterRemoval = false;
  private pendingGenerationFocus: ProseGenerationFocusRequest | null = null;
  private generationFocusTimeout: number | null = null;
  readonly slashCommandMenuPosition = signal<SlashCommandMenuPosition | null>(null);
  readonly slashCommandMenuSelectedIndex = signal(0);

  showCreateSceneHint = computed(() => this.hasLoadedContent() && !this.hasSceneNodes());
  canInsertChapter = computed(() => this.hasActNodes());
  canInsertScene = computed(() => this.hasChapterNodes());

  currentScopeLabel = computed<string>(() => {
    const mode = this.store.mode();
    const id = this.store.activeEntityId();

    if (mode === 'book') return 'Full Novel';
    if (!mode || !id) return '';

    for (const act of this.store.bookHierarchy()) {
      if (mode === 'act' && act.id === id) {
        const actLabel = `Act ${act.position + 1}`;
        return act.title ? `${actLabel}: ${act.title}` : actLabel;
      }

      for (const chapter of act.chapters || []) {
        if (mode === 'chapter' && chapter.id === id) {
          const chapterLabel = `Chapter ${chapter.position + 1}`;
          return chapter.title ? `${chapterLabel}: ${chapter.title}` : chapterLabel;
        }

        const scene = (chapter.scenes || []).find(s => s.id === id);
        if (mode === 'scene' && scene) {
          const sceneLabel = `Scene ${scene.position + 1}`;
          return scene.title ? `${sceneLabel}: ${scene.title}` : sceneLabel;
        }
      }
    }

    return '';
  });


  // ---------------------------------------------------------------------------
  // Toolbar Options
  // ---------------------------------------------------------------------------

  fontOptions: DropdownOption[] = [
    // Serif
    { value: "'Merriweather', serif", label: 'Merriweather', fontFamily: "'Merriweather', serif", group: 'Serif' },
    { value: "'EB Garamond', serif", label: 'EB Garamond', fontFamily: "'EB Garamond', serif", group: 'Serif' },
    { value: "'Lora', serif", label: 'Lora', fontFamily: "'Lora', serif", group: 'Serif' },
    { value: "'Georgia', serif", label: 'Georgia', fontFamily: "'Georgia', serif", group: 'Serif' },
    { value: "'Crimson Pro', serif", label: 'Crimson Pro', fontFamily: "'Crimson Pro', serif", group: 'Serif' },
    { value: "'Literata', serif", label: 'Literata', fontFamily: "'Literata', serif", group: 'Serif' },

    // Sans Serif
    { value: "'Inter', sans-serif", label: 'Inter', fontFamily: "'Inter', sans-serif", group: 'Sans Serif' },
    { value: "'Open Sans', sans-serif", label: 'Open Sans', fontFamily: "'Open Sans', sans-serif", group: 'Sans Serif' },

    // Monospace
    { value: "'Courier Prime', monospace", label: 'Courier Prime', fontFamily: "'Courier Prime', monospace", group: 'Monospace' },
    { value: "'Fira Code', monospace", label: 'Fira Code', fontFamily: "'Fira Code', monospace", group: 'Monospace' },
    { value: "'Source Code Pro', monospace", label: 'Source Code Pro', fontFamily: "'Source Code Pro', monospace", group: 'Monospace' },
    { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono', fontFamily: "'JetBrains Mono', monospace", group: 'Monospace' },
  ];


  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Flushes pending manuscript writes in dependency order.
   * Dirty scene prose updates must run before vector sync so the paragraph
   * cache reflects the latest editor state.
   */
  private closeHandler = async () => {
    if (this.editor) this.selectionEdits.detachEditor(this.editor);
    await this.saver.flushDirtySections();
    await this.saver.flushStructuralChanges();
    await this.saver.flushParagraphVectorChanges();
  };

  ngOnInit(): void {
    this.editor = this.createEditor();
    this.search.attachEditor(this.editor);
    this.aiStreamEditor.attachEditor(this.editor);

    this.store.setEditor(this.editor);
    void this.aiStore.refreshModels();

    this.electronService.onBeforeClose(this.closeHandler);

    this.route.params.subscribe(async params => {
      this.aiStreamEditor.beginViewChange();
      try {
        this.isNavigatingAfterRemoval = false;
        if (this.editor) this.selectionEdits.detachEditor(this.editor);
        // Route changes reuse this component, so flush pending prose and vector
        // updates before replacing the editor document.
        await this.saver.flushDirtySections();
        await this.saver.flushParagraphVectorChanges();

        const mode = params['mode'] as ManuscriptMode;
        const id = params['id'];
        this.hasLoadedContent.set(false);
        this.search.setCurrentScopeData(null);
        this.store.setRouteParams(mode, id);

        const bookId = this.getWorkspaceBookId();
        this.search.invalidateWholeManuscriptData(bookId ?? undefined);
        if (this.search.open() && this.search.wholeManuscript() && bookId) {
          await this.search.reloadWholeManuscript({ bookId, mode });
        }
        if (bookId) {
          void this.paragraphVectorSync.refreshIndexingConfiguration(bookId).catch(error => {
            console.error('Failed to load manuscript indexing configuration:', error);
          });
        }

        if (mode && id && this.editor) {
          await this.loadEditorContent(mode, id);
        }
      } finally {
        this.aiStreamEditor.endViewChange();
      }
    });
  }

  ngOnDestroy(): void {
    this.electronService.removeBeforeCloseHandler(this.closeHandler);
    this.closeHandler();

    if (this.editor) {
      this.search.detachEditor();
      this.selectionEdits.detachEditor(this.editor);
      this.aiStreamEditor.detachEditor(this.editor);
    }
    this.editor?.destroy();
    this.store.setEditor(null);
    if (this.generationFocusTimeout !== null) {
      window.clearTimeout(this.generationFocusTimeout);
    }
  }


  // ---------------------------------------------------------------------------
  // Editor Setup
  // ---------------------------------------------------------------------------

  private createEditor(): Editor {
    return new Editor({
      editorProps: {
        attributes: { spellcheck: 'false' },
      },

      extensions: [
        StarterKit,
        Markdown,
        Placeholder.configure({
          placeholder: ({ editor, pos }) => isPositionInsideSceneProse(editor.state.doc, pos)
            ? 'Start writing or type / for commands...'
            : '',
          emptyEditorClass: 'is-editor-empty',
        }),

        SlashCommandMenuExtension.configure({
          onOpen: anchor => this.openSlashCommandMenu(anchor),
          onClose: () => this.slashCommandMenuPosition.set(null),
          onNavigate: direction => this.navigateSlashCommandMenu(direction),
          onSelect: () => this.selectActiveSlashCommand(),
        }),
        AiPromptExtension(this.injector),
        AiGeneratedBlockExtension(this.injector),
        ActHeaderExtension(this.injector),
        ChapterHeaderExtension(this.injector),
        SceneSummaryExtension(this.injector),
        SceneSkeletonExtension(this.injector),
        ManuscriptEditingGuardExtension,
        ManuscriptSearchExtension,
        UniqueIdExtension,
      ],

      onUpdate: ({ transaction }) => {
        this.refreshStructureAvailability();
        this.refreshIndexItems();

        if (transaction.docChanged && !transaction.getMeta('skipSaver')) {
          this.saver.onDocumentChanged(transaction, this.editor!);
        }

        if (transaction.docChanged) {
          void this.navigateAfterActiveScopeRemoval();
          if (this.search.open()) this.search.refresh({ preserveActiveMatch: true });
        }
      },
    });
  }

  selectSlashCommand(command: SlashCommand): void {
    if (!this.editor) return;
    selectSlashCommand(this.editor, command);
  }

  dismissSlashCommandMenu(): void {
    if (!this.editor) return;
    dismissSlashCommandMenu(this.editor);
  }

  private openSlashCommandMenu(anchor: SlashCommandMenuAnchor): void {
    if (!this.slashCommandMenuPosition()) this.slashCommandMenuSelectedIndex.set(0);
    this.slashCommandMenuPosition.set(positionSlashCommandMenu(anchor));
  }

  private navigateSlashCommandMenu(direction: 1 | -1): void {
    const itemCount = SLASH_COMMAND_MENU_ITEMS.length;
    this.slashCommandMenuSelectedIndex.update(index => (index + direction + itemCount) % itemCount);
  }

  private selectActiveSlashCommand(): void {
    const item = SLASH_COMMAND_MENU_ITEMS[this.slashCommandMenuSelectedIndex()];
    if (item) this.selectSlashCommand(item.command);
  }

  /**
   * Loads manuscript data through a raw ProseMirror transaction so initial
   * content does not enter the undo stack or trigger save detection.
   */
  private async loadEditorContent(mode: ManuscriptMode, id: string): Promise<void> {
    try {
      const data = await this.store.loadManuscriptData(mode, id);
      this.search.setCurrentScopeData(data);

      const { doc, skeletonSceneIds } = buildEditorContentLazy(mode, data);
      this.store.setPendingSkeletons(skeletonSceneIds);

      const newDoc = this.editor!.schema.nodeFromJSON(doc);
      const { tr } = this.editor!.state;

      tr.replaceWith(0, tr.doc.content.size, newDoc.content);
      tr.setMeta('addToHistory', false);
      tr.setMeta('skipSaver', true);

      this.editor!.view.dispatch(tr);
      this.saver.seedCleanSnapshots(this.editor!);
      this.aiStreamEditor.syncActiveGenerations(this.editor!);
      const bookId = this.getWorkspaceBookId();
      if (bookId) this.selectionEdits.attachEditor(this.editor!, bookId);
      this.hasLoadedContent.set(true);
      this.refreshStructureAvailability();
      this.refreshIndexItems();
      if (this.search.open()) {
        this.search.refresh({ preserveActiveMatch: true });
        void this.focusActiveSearchMatch();
      }
      void this.focusPendingGeneration();
    } catch (error) {
      this.hasLoadedContent.set(true);
      this.refreshStructureAvailability();
      console.error('Failed to load manuscript content:', error);
    }
  }


  // ---------------------------------------------------------------------------
  // Manuscript Search
  // ---------------------------------------------------------------------------

  @HostListener('document:keydown', ['$event'])
  handleSearchShortcut(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 'f' || (!event.ctrlKey && !event.metaKey) || event.altKey) return;

    event.preventDefault();
    event.stopPropagation();
    if (!this.search.open()) this.openSearch();
    else this.closeSearch();
  }

  openSearch(): void {
    this.search.show();
    queueMicrotask(() => this.manuscriptSearchWidget?.focusInput());
  }

  closeSearch(): void {
    this.search.close();
    this.editor?.commands.focus();
  }

  updateSearchQuery(query: string): void {
    this.search.updateQuery(query);
    void this.focusActiveSearchMatch();
  }

  updateSearchMatchCase(matchCase: boolean): void {
    this.search.updateMatchCase(matchCase);
    void this.focusActiveSearchMatch();
  }

  updateSearchWholeWord(wholeWord: boolean): void {
    this.search.updateWholeWord(wholeWord);
    void this.focusActiveSearchMatch();
  }

  async updateSearchScope(wholeManuscript: boolean): Promise<void> {
    await this.search.updateScope({
      wholeManuscript,
      bookId: this.getWorkspaceBookId(),
      mode: this.store.mode(),
    });
    await this.focusActiveSearchMatch();
  }

  async retryWholeManuscriptSearch(): Promise<void> {
    await this.search.retryWholeManuscript({
      bookId: this.getWorkspaceBookId(),
      mode: this.store.mode(),
    });
    await this.focusActiveSearchMatch();
  }

  async selectPreviousSearchMatch(): Promise<void> {
    this.search.select(-1);
    await this.focusActiveSearchMatch();
  }

  async selectNextSearchMatch(): Promise<void> {
    this.search.select(1);
    await this.focusActiveSearchMatch();
  }

  private async focusActiveSearchMatch(): Promise<void> {
    let activeMatch = this.search.activeMatch();
    if (!activeMatch || !this.editor) return;
    if (typeof activeMatch.from === 'number') {
      this.scrollToSearchMatch(activeMatch.from);
      return;
    }

    if (this.search.currentScopeContainsScene(activeMatch.sceneId)) {
      await this.store.loadAndPatchScene(activeMatch.sceneId);
      this.search.refresh({ preserveActiveMatch: true });
      activeMatch = this.search.activeMatch();
      if (activeMatch && typeof activeMatch.from === 'number') this.scrollToSearchMatch(activeMatch.from);
      return;
    }

    if (!this.search.wholeManuscript()) return;
    const bookId = this.getWorkspaceBookId();
    if (!bookId) return;

    const navigated = await this.router.navigate(
      ['/workspace', bookId, 'manuscript', 'scene', activeMatch.sceneId],
      { replaceUrl: true },
    );
    if (!navigated) this.search.clearPendingMatch();
  }

  private scrollToSearchMatch(position: number): void {
    if (!this.editor || this.editor.isDestroyed) return;

    requestAnimationFrame(() => {
      if (!this.editor || this.editor.isDestroyed) return;
      const coordinates = this.editor.view.coordsAtPos(position);
      const scrollContainer = document.querySelector<HTMLElement>('.editor-content-wrapper');
      if (!scrollContainer) return;

      const containerRect = scrollContainer.getBoundingClientRect();
      const targetTop = coordinates.top
        - containerRect.top
        + scrollContainer.scrollTop
        - scrollContainer.clientHeight / 3;
      scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    });
  }

  // ---------------------------------------------------------------------------
  // Toolbar Actions
  // ---------------------------------------------------------------------------

  getActiveFormatLabel(): string {
    if (!this.editor) return 'Normal Text';

    if (this.editor.isActive('heading', { level: 1 })) return 'Heading 1';
    if (this.editor.isActive('heading', { level: 2 })) return 'Heading 2';
    if (this.editor.isActive('heading', { level: 3 })) return 'Heading 3';
    if (this.editor.isActive('heading', { level: 4 })) return 'Heading 4';

    return 'Normal Text';
  }

  /** Delegates cascaded DB writes and Tiptap insertion to the store. */
  async insertAct(): Promise<void> {
    try {
      await this.store.insertAct();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create act.';
      this.toastService.error(message, 'Manuscript');
    }
  }

  async insertChapter(): Promise<void> {
    try {
      await this.store.insertChapter();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create chapter.';
      this.toastService.error(message, 'Manuscript');
    }
  }

  async insertScene(): Promise<void> {
    try {
      await this.store.insertScene();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create scene.';
      this.toastService.error(message, 'Manuscript');
    }
  }


  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  switchViewMode(mode: ManuscriptMode, id: string): void {
    const bookId = this.getWorkspaceBookId();
    if (!bookId) return;

    this.router.navigate(['/workspace', bookId, 'manuscript', mode, id], { replaceUrl: true });
  }

  async focusProseGeneration(request: ProseGenerationFocusRequest): Promise<void> {
    const location = this.resolveSceneLocation(request.sceneId);
    if (!location) return;

    if (this.currentViewContainsScene(location)) {
      await this.focusGenerationInCurrentView(request);
      return;
    }

    this.pendingGenerationFocus = request;
    const navigated = await this.router.navigate(
      ['/workspace', location.bookId, 'manuscript', 'scene', request.sceneId],
      { replaceUrl: true },
    );

    if (!navigated) this.pendingGenerationFocus = null;
  }

  retryIndexing(): void {
    void this.paragraphVectorSync.retryParagraphVectorChanges();
  }

  updateIndex(): void {
    void this.paragraphVectorSync.flushParagraphVectorChanges();
  }


  // ---------------------------------------------------------------------------
  // Scroll Index
  // ---------------------------------------------------------------------------

  scrollToSection(item: ManuscriptIndexItem): void {
    const element = document.getElementById(`section-${item.id}`);
    if (!element) return;

    const scrollContainer = document.querySelector('.editor-content-wrapper');

    if (scrollContainer) {
      const offsetPadding = 20;
      const relativeTop =
        element.getBoundingClientRect().top -
        scrollContainer.getBoundingClientRect().top +
        scrollContainer.scrollTop -
        offsetPadding;

      scrollContainer.scrollTo({ top: relativeTop, behavior: 'smooth' });
    } else {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }


  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private refreshIndexItems(): void {
    if (!this.editor) return;

    const mode = this.store.mode();

    if (mode === 'scene') {
      this.indexItems.set([]);
      return;
    }

    const activeEntityId = this.store.activeEntityId();
    if (!activeEntityId) return;

    const data = extractManuscriptHierarchyById(this.editor, activeEntityId);
    if (!data) return;

    const items: ManuscriptIndexItem[] = [];

    data.forEach(act => {
      if (mode === 'book' && act.id) {
        const position = (act.position || 0) + 1;
        const title = act.title || 'Untitled Act';
        items.push({ id: act.id, label: `Act ${position}: ${title}`, type: 'act' });
      }

      (act.chapters || []).forEach(chapter => {
        if ((mode === 'book' || mode === 'act') && chapter.id) {
          const position = (chapter.position || 0) + 1;
          const title = chapter.title || 'Untitled Chapter';
          items.push({ id: chapter.id, label: `Chapter ${position}: ${title}`, type: 'chapter' });
        }

        (chapter.scenes || []).forEach(scene => {
          if (!scene.id) return;

          const fullProseText = extractTextFromManuscriptData(scene);
          const scenePosition = scene.position || 0;
          const maxPreviewLen = 30;

          let prosePreview = fullProseText.substring(0, maxPreviewLen);
          if (fullProseText.length > maxPreviewLen) prosePreview += '...';

          const title = scene.title || prosePreview || `Empty Scene ${scenePosition}`;
          items.push({ id: scene.id, label: title, type: 'scene' });
        });
      });
    });

    this.indexItems.set(items);
  }

  private async focusPendingGeneration(): Promise<void> {
    const request = this.pendingGenerationFocus;
    if (!request) return;

    const location = this.resolveSceneLocation(request.sceneId);
    if (!location || !this.currentViewContainsScene(location)) return;

    this.pendingGenerationFocus = null;
    await this.focusGenerationInCurrentView(request);
  }

  private async focusGenerationInCurrentView(
    request: ProseGenerationFocusRequest,
  ): Promise<void> {
    await this.store.loadAndPatchScene(request.sceneId);
    if (!this.editor || this.editor.isDestroyed) return;

    if (request.target === 'selection-edit') {
      const bookId = this.getWorkspaceBookId();
      if (bookId) this.selectionEdits.attachEditor(this.editor, bookId);
      this.editorBubbleMenu.focusSelectionEdit(request.sessionId);
      return;
    }

    this.aiStreamEditor.syncActiveGenerations(this.editor);
    requestAnimationFrame(() => this.scrollToGenerationBlock(request.blockId));
  }

  private scrollToGenerationBlock(blockId: string): void {
    if (!this.editor || this.editor.isDestroyed) return;

    let blockPosition: number | null = null;
    this.editor.state.doc.descendants((node, position) => {
      if (
        blockPosition === null
        && node.type.name === 'aiGeneratedBlock'
        && node.attrs['id'] === blockId
      ) {
        blockPosition = position;
      }

      return blockPosition === null;
    });
    if (blockPosition === null) return;

    const nodeDom = this.editor.view.nodeDOM(blockPosition);
    const domAtPosition = this.editor.view.domAtPos(blockPosition);
    const nodeAtPosition = domAtPosition.node.childNodes.item(domAtPosition.offset);
    const element = nodeDom instanceof HTMLElement
      ? nodeDom
      : nodeAtPosition instanceof HTMLElement
        ? nodeAtPosition
        : nodeDom?.parentElement ?? nodeAtPosition?.parentElement;
    if (!element) return;

    const scrollContainer = element.closest<HTMLElement>('.editor-content-wrapper')
      ?? document.querySelector<HTMLElement>('.editor-content-wrapper');
    if (scrollContainer) {
      const elementRect = element.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const centeredTop = elementRect.top
        - containerRect.top
        + scrollContainer.scrollTop
        - (scrollContainer.clientHeight - elementRect.height) / 2;
      scrollContainer.scrollTo({ top: Math.max(0, centeredTop), behavior: 'smooth' });
    } else {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    element.classList.remove('prose-generation-focus');
    void element.offsetWidth;
    element.classList.add('prose-generation-focus');

    if (this.generationFocusTimeout !== null) {
      window.clearTimeout(this.generationFocusTimeout);
    }
    this.generationFocusTimeout = window.setTimeout(() => {
      element.classList.remove('prose-generation-focus');
      this.generationFocusTimeout = null;
    }, 1800);
  }

  private resolveSceneLocation(sceneId: string): {
    actId: string;
    bookId: string;
    chapterId: string;
    sceneId: string;
  } | null {
    for (const act of this.store.bookHierarchy()) {
      for (const chapter of act.chapters || []) {
        if ((chapter.scenes || []).some(scene => scene.id === sceneId)) {
          return {
            actId: act.id,
            bookId: act.bookId,
            chapterId: chapter.id,
            sceneId,
          };
        }
      }
    }

    return null;
  }

  private currentViewContainsScene(location: {
    actId: string;
    bookId: string;
    chapterId: string;
    sceneId: string;
  }): boolean {
    const activeEntityId = this.store.activeEntityId();

    switch (this.store.mode()) {
      case 'book': return activeEntityId === location.bookId;
      case 'act': return activeEntityId === location.actId;
      case 'chapter': return activeEntityId === location.chapterId;
      case 'scene': return activeEntityId === location.sceneId;
      default: return false;
    }
  }

  private refreshStructureAvailability(): void {
    let hasAct = false;
    let hasChapter = false;
    let hasScene = false;

    this.editor?.state.doc.forEach(node => {
      if (node.type.name === 'actHeader') hasAct = true;
      if (node.type.name === 'chapterHeader') hasChapter = true;
      if (node.type.name === 'sceneSummary') hasScene = true;
    });

    this.hasActNodes.set(hasAct);
    this.hasChapterNodes.set(hasChapter);
    this.hasSceneNodes.set(hasScene);
  }

  private async navigateAfterActiveScopeRemoval(): Promise<void> {
    if (
      !this.hasLoadedContent()
      || this.isNavigatingAfterRemoval
      || this.activeScopeExistsInEditor()
    ) return;

    const bookId = this.getWorkspaceBookId();
    if (!bookId) return;

    this.isNavigatingAfterRemoval = true;

    try {
      await this.saver.flushStructuralChanges();
      const navigated = await this.router.navigate(
        ['/workspace', bookId, 'manuscript', 'book', bookId],
        { replaceUrl: true },
      );

      if (!navigated) {
        this.isNavigatingAfterRemoval = false;
      }
    } catch (error) {
      this.isNavigatingAfterRemoval = false;
      const message = error instanceof Error
        ? error.message
        : 'Failed to switch manuscript view after removing the active section.';
      this.toastService.error(message, 'Manuscript');
    }
  }

  private activeScopeExistsInEditor(): boolean {
    const mode = this.store.mode();
    const activeEntityId = this.store.activeEntityId();
    if (!this.editor || !mode || !activeEntityId || mode === 'book') return true;

    const nodeType = mode === 'act'
      ? 'actHeader'
      : mode === 'chapter'
        ? 'chapterHeader'
        : 'sceneSummary';
    let exists = false;

    this.editor.state.doc.forEach(node => {
      if (node.type.name === nodeType && node.attrs['id'] === activeEntityId) {
        exists = true;
      }
    });

    return exists;
  }

  private getWorkspaceBookId(): string | null {
    return this.route.parent?.snapshot.paramMap.get('bookId') ||
      this.store.bookHierarchy()[0]?.bookId ||
      this.store.bookId();
  }
}

function positionSlashCommandMenu(anchor: SlashCommandMenuAnchor): SlashCommandMenuPosition {
  const viewportPadding = 12;
  const menuGap = 8;
  const menuWidth = Math.min(370, window.innerWidth - viewportPadding * 2);
  const menuHeight = 360;
  const preferredTop = anchor.bottom + menuGap;
  const top = preferredTop + menuHeight <= window.innerHeight - viewportPadding
    ? preferredTop
    : Math.max(viewportPadding, anchor.top - menuHeight - menuGap);
  const left = Math.min(
    Math.max(viewportPadding, anchor.left),
    Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
  );

  return { left, top };
}
