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
import { UniqueIdExtension } from './extensions/unique-id.extension';
import {
  buildEditorContentLazy,
  extractManuscriptHierarchyById,
  extractTextFromManuscriptData,
} from './helpers/content/manuscript-content.utils';
import { ManuscriptProseSaverService } from './helpers/saving/manuscript-prose-saver.service';
import { AiStore } from '../../core/store/ai.store';
import { CodexContextHighlightDirective } from '../codex/highlighting/codex-context-highlight.directive';
import { ManuscriptStore } from './store/manuscript.store';

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

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly saver = inject(ManuscriptProseSaverService);


  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  editor: Editor | undefined;

  indexItems = signal<ManuscriptIndexItem[]>([]);

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

    this.store.setEditor(this.editor);
    this.aiStore.loadModels();

    this.electronService.onBeforeClose(this.closeHandler);

    this.route.params.subscribe(async params => {
      // Route changes reuse this component, so flush vector updates before
      // replacing the editor document with the next manuscript context.
      await this.saver.flushParagraphVectorChanges();

      const mode = params['mode'] as ManuscriptMode;
      const id = params['id'];
      this.store.setRouteParams(mode, id);

      if (mode && id && this.editor) {
        await this.loadEditorContent(mode, id);
      }
    });
  }

  ngOnDestroy(): void {
    this.electronService.removeBeforeCloseHandler(this.closeHandler);
    this.closeHandler();

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
          placeholder: 'Start writing or type /ai for AI assistant...',
          emptyEditorClass: 'is-editor-empty',
        }),

        AiPromptExtension(this.injector),
        AiGeneratedBlockExtension(this.injector),
        ActHeaderExtension(this.injector),
        ChapterHeaderExtension(this.injector),
        SceneSummaryExtension(this.injector),
        SceneSkeletonExtension(this.injector),
        UniqueIdExtension,
      ],

      onUpdate: ({ transaction }) => {
        this.refreshIndexItems();

        if (transaction.docChanged && !transaction.getMeta('skipSaver')) {
          this.saver.onDocumentChanged(transaction, this.editor!);
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
      this.refreshIndexItems();
    } catch (error) {
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
  insertAct(): void {
    this.store.insertAct();
  }

  insertChapter(): void {
    this.store.insertChapter();
  }

  insertScene(): void {
    this.store.insertScene();
  }


  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  switchViewMode(mode: ManuscriptMode, id: string): void {
    const bookId = this.getWorkspaceBookId();
    if (!bookId) return;

    this.router.navigate(['/workspace', bookId, 'manuscript', mode, id], { replaceUrl: true });
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

  private getWorkspaceBookId(): string | null {
    return this.route.parent?.snapshot.paramMap.get('bookId') ||
      this.store.bookHierarchy()[0]?.bookId ||
      this.store.bookId();
  }
}
