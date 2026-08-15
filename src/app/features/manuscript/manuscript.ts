import { CommonModule } from '@angular/common';
import { CdkMenuModule } from '@angular/cdk/menu';
import { Component, Injector, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
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
import { SceneHeaderComponent } from './components/scene/scene-header/scene-header.component';
import { SceneSkeletonExtension } from './components/scene/scene-skeleton/scene-skeleton.extension';
import { SceneSummaryExtension } from './components/scene/scene-summary/scene-summary.extension';
import {
  isPositionInsideSceneProse,
  ManuscriptEditingGuardExtension,
} from './extensions/manuscript-editing-guard.extension';
import { UniqueIdExtension } from './extensions/unique-id.extension';
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
import { AiGenerationSessionService } from '../../core/services/ai-generation-session.service';
import { ToastService } from '../../shared/services/toast.service';

interface ManuscriptRouteTarget {
  mode: ManuscriptMode;
  id: string;
}

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
    SceneHeaderComponent,
    CodexContextHighlightDirective,
  ],
  templateUrl: './manuscript.html',
  styleUrl: './manuscript.scss',
})
export class Manuscript implements OnInit, OnDestroy {

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  readonly store = inject(ManuscriptStore);
  readonly aiStore = inject(AiStore);
  readonly themeService = inject(ThemeService);
  readonly electronService = inject(ElectronService);
  readonly paragraphVectorSync = inject(ManuscriptParagraphVectorSyncService);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly saver = inject(ManuscriptProseSaverService);
  private readonly aiStreamEditor = inject(AiStreamEditorService);
  private readonly generationSessions = inject(AiGenerationSessionService);
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
        return `Act ${act.position + 1}: ${act.title || 'Untitled Act'}`;
      }

      for (const chapter of act.chapters || []) {
        if (mode === 'chapter' && chapter.id === id) {
          return `Chapter ${chapter.position + 1}: ${chapter.title || 'Untitled Chapter'}`;
        }

        const scene = (chapter.scenes || []).find(s => s.id === id);
        if (mode === 'scene' && scene) {
          return `Scene ${scene.position + 1}: ${scene.title || 'Untitled Scene'}`;
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
    await this.saver.flushDirtySections();
    await this.saver.flushStructuralChanges();
    await this.saver.flushParagraphVectorChanges();
  };

  ngOnInit(): void {
    this.editor = this.createEditor();
    this.aiStreamEditor.attachEditor(this.editor);

    this.store.setEditor(this.editor);
    void this.aiStore.refreshModels();

    this.electronService.onBeforeClose(this.closeHandler);

    this.route.params.subscribe(async params => {
      this.aiStreamEditor.beginViewChange();
      try {
        this.isNavigatingAfterRemoval = false;
        // Route changes reuse this component, so flush pending prose and vector
        // updates before replacing the editor document.
        await this.saver.flushDirtySections();
        await this.saver.flushParagraphVectorChanges();

        const mode = params['mode'] as ManuscriptMode;
        const id = params['id'];
        this.hasLoadedContent.set(false);
        this.store.setRouteParams(mode, id);

        const bookId = this.getWorkspaceBookId();
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

    if (this.editor) this.aiStreamEditor.detachEditor(this.editor);
    this.editor?.destroy();
    this.store.setEditor(null);
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
            ? 'Start writing or type /ai for AI assistant...'
            : '',
          emptyEditorClass: 'is-editor-empty',
        }),

        AiPromptExtension(this.injector),
        AiGeneratedBlockExtension(this.injector),
        ActHeaderExtension(this.injector),
        ChapterHeaderExtension(this.injector),
        SceneSummaryExtension(this.injector),
        SceneSkeletonExtension(this.injector),
        ManuscriptEditingGuardExtension,
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
        }
      },
    });
  }

  /**
   * Loads manuscript data through a raw ProseMirror transaction so initial
   * content does not enter the undo stack or trigger save detection.
   */
  private async loadEditorContent(mode: ManuscriptMode, id: string): Promise<void> {
    try {
      const data = await this.store.loadManuscriptData(mode, id);

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
      this.hasLoadedContent.set(true);
      this.refreshStructureAvailability();
      this.refreshIndexItems();
    } catch (error) {
      this.hasLoadedContent.set(true);
      this.refreshStructureAvailability();
      console.error('Failed to load manuscript content:', error);
    }
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
    if (this.hasActiveSelectionGeneration()) {
      this.toastService.warning(
        'Finish or cancel the active Ask AI selection before changing views.',
        'AI Generation',
      );
      return;
    }

    const bookId = this.getWorkspaceBookId();
    if (!bookId) return;

    this.router.navigate(['/workspace', bookId, 'manuscript', mode, id], { replaceUrl: true });
  }

  private hasActiveSelectionGeneration(): boolean {
    return this.generationSessions.sessions().some(session => (
      session.source === 'manuscript-selection'
      && session.status() !== 'complete'
      && session.status() !== 'stopped'
      && session.status() !== 'failed'
    ));
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

    const target = this.getActiveScopeParentRoute();
    const bookId = this.getWorkspaceBookId();
    if (!target || !bookId) return;

    this.isNavigatingAfterRemoval = true;

    try {
      await this.saver.flushStructuralChanges();
      const navigated = await this.router.navigate(
        ['/workspace', bookId, 'manuscript', target.mode, target.id],
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

  private getActiveScopeParentRoute(): ManuscriptRouteTarget | null {
    const mode = this.store.mode();
    const activeEntityId = this.store.activeEntityId();
    if (!mode || !activeEntityId || mode === 'book') return null;

    for (const act of this.store.bookHierarchy()) {
      if (mode === 'act' && act.id === activeEntityId) {
        return { mode: 'book', id: act.bookId };
      }

      for (const chapter of act.chapters || []) {
        if (mode === 'chapter' && chapter.id === activeEntityId) {
          return { mode: 'act', id: act.id };
        }

        if (mode === 'scene' && chapter.scenes?.some(scene => scene.id === activeEntityId)) {
          return { mode: 'chapter', id: chapter.id };
        }
      }
    }

    return null;
  }

  private getWorkspaceBookId(): string | null {
    return this.route.parent?.snapshot.paramMap.get('bookId') ||
      this.store.bookHierarchy()[0]?.bookId ||
      this.store.bookId();
  }
}
