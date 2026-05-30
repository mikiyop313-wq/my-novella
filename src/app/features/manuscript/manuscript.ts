import { Component, OnDestroy, OnInit, Injector, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TiptapEditorDirective } from 'ngx-tiptap';
import { CdkMenuModule } from '@angular/cdk/menu';

import { ThemeService } from '../../core/services/theme.service';
import { ElectronService } from '../../core/services/electron.service';
import { AutocompleteDropdownComponent, DropdownOption } from '../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { AiPromptExtension } from './components/ai-prompt/ai-node-extension';
import { EditorBubbleMenuComponent } from './components/editor-bubble-menu/editor-bubble-menu.component';
import { ActHeaderExtension, ChapterHeaderExtension } from './components/manuscript-header/manuscript-header.extension';
import { SceneSummaryExtension } from './components/scene-summary/scene-summary.extension';
import { ManuscriptIndexScrollComponent, ManuscriptIndexItem } from './components/manuscript-index-scroll/manuscript-index-scroll.component';
import { AiGeneratedBlockExtension } from './components/ai-generated-block/ai-generated-block.extension';
import { UniqueIdExtension } from './extensions/unique-id.extension';

import { ManuscriptStore } from './store/manuscript.store';
import { AiStore } from './store/ai.store';

import { ManuscriptMode, SceneDto } from '../../../../shared/models/manuscript.model';
import { buildEditorContent, getProseTextById, extractTextFromManuscriptData } from './helpers/manuscript-content.utils';
import { ManuscriptProseSaverService } from './helpers/manuscript-prose-saver.service';

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
  ],
  templateUrl: './manuscript.html',
  styleUrl: './manuscript.scss',
})
export class Manuscript implements OnInit, OnDestroy {
  editor: Editor | undefined;

  readonly store = inject(ManuscriptStore);
  readonly aiStore = inject(AiStore);
  readonly themeService = inject(ThemeService);
  readonly electronService = inject(ElectronService);

  private route = inject(ActivatedRoute);
  private injector = inject(Injector);
  private saver = inject(ManuscriptProseSaverService);

  sceneTitle = signal<string>('');
  indexItems = signal<ManuscriptIndexItem[]>([]);

  // ── Font picker options ───────────────────────────────────────────────────
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

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  private closeHandler = async () => {
    await this.saver.flushSceneTitle();
    await this.saver.flushDirtySections();
    await this.saver.flushStructuralChanges();
    // Must run after flushDirtySections so the paragraph cache is fully populated.
    await this.saver.flushParagraphVectorChanges();
  };

  ngOnInit(): void {
    this.editor = this.createEditor();
    this.store.setEditor(this.editor);
    this.aiStore.loadModels();

    // Listen for graceful application close
    this.electronService.onBeforeClose(this.closeHandler);

    // Load on initialization and when route params change.
    this.route.params.subscribe(async params => {
      // Flush any pending paragraph changes from the previous scene/chapter/act
      // before switching context. The component is not destroyed on route changes,
      // so this is the only opportunity to sync mid-session navigation.
      await this.saver.flushParagraphVectorChanges();

      const mode = params['mode'] as ManuscriptMode;
      const id = params['id'];
      this.store.setRouteParams(mode, id);

      if (mode && id && this.editor) {
        try {
          const data = await this.store.loadManuscriptData(mode, id);
          if (mode === 'scene') this.sceneTitle.set((data as SceneDto).title);
          // Use a raw transaction with addToHistory: false so the initial
          // content load is never added to the undo stack.  Without this,
          // pressing Undo on a freshly-opened manuscript would revert the
          // document to an empty state and the auto-saver would persist it.
          const content = buildEditorContent(mode, data);
          const newDoc = this.editor.schema.nodeFromJSON(content);
          const { tr } = this.editor.state;
          tr.replaceWith(0, tr.doc.content.size, newDoc.content);
          tr.setMeta('addToHistory', false);
          tr.setMeta('skipSaver', true);
          this.editor.view.dispatch(tr);

          this.refreshIndexItems();
        } catch (error) {
          console.error('Failed to load manuscript content:', error);
        }
      }
    });
  }

  ngOnDestroy(): void {
    // Unregister graceful close listener to prevent memory leaks and dangling calls
    this.electronService.removeBeforeCloseHandler(this.closeHandler);

    // Flush any unsaved changes immediately before the editor is torn down.
    this.closeHandler();
    
    this.editor?.destroy();
    this.store.setEditor(null);
  }

  // ── Editor factory ────────────────────────────────────────────────────────

  private createEditor(): Editor {
    return new Editor({
      editorProps: {
        attributes: {
          spellcheck: 'false',
        }
      },
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: 'Start writing or type /ai for AI assistant...',
          emptyEditorClass: 'is-editor-empty',
        }),
        AiPromptExtension(this.injector),
        AiGeneratedBlockExtension(this.injector),
        ActHeaderExtension(this.injector),
        ChapterHeaderExtension(this.injector),
        SceneSummaryExtension(this.injector),
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

  // ── Toolbar helpers ───────────────────────────────────────────────────────

  getActiveFormatLabel(): string {
    if (!this.editor) return 'Normal Text';
    if (this.editor.isActive('heading', { level: 1 })) return 'Heading 1';
    if (this.editor.isActive('heading', { level: 2 })) return 'Heading 2';
    if (this.editor.isActive('heading', { level: 3 })) return 'Heading 3';
    if (this.editor.isActive('heading', { level: 4 })) return 'Heading 4';
    return 'Normal Text';
  }

  // Delegates to the store, which handles cascaded DB writes and Tiptap insertion.
  insertAct() { this.store.insertAct(); }
  insertChapter() { this.store.insertChapter(); }
  insertScene() { this.store.insertScene(); }

  // ── Scene title input ─────────────────────────────────────────────────────

  onSceneChange(event: Event): void {
    const title = (event.target as HTMLInputElement).value;
    this.sceneTitle.set(title);
    this.saver.scheduleSceneTitleSave(title);
  }

  // ── Scroll index ──────────────────────────────────────────────────────────

  scrollToSection(item: ManuscriptIndexItem): void {
    const element = document.getElementById(`section-${item.id}`);
    if (!element) return;

    const scrollContainer = document.querySelector('.editor-content-wrapper');
    if (scrollContainer) {
      const relativeTop =
        element.getBoundingClientRect().top -
        scrollContainer.getBoundingClientRect().top +
        scrollContainer.scrollTop -
        20; // 20 px padding
      scrollContainer.scrollTo({ top: relativeTop, behavior: 'smooth' });
    } else {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private refreshIndexItems(): void {
    if (!this.editor) return;

    const mode = this.store.mode();
    const items: ManuscriptIndexItem[] = [];

    if (mode === 'scene') {
      this.indexItems.set([]);
      return;
    }

    const data = getProseTextById(this.editor);
    if (!data || !Array.isArray(data)) return;

    data.forEach(act => {
      if (mode === 'book' && act.id) {
        items.push({ id: act.id, label: `Act ${(act.position || 0) + 1}: ${act.title || 'Untitled Act'}`, type: 'act' });
      }
      (act.chapters || []).forEach(chapter => {
        if ((mode === 'book' || mode === 'act') && chapter.id) {
          items.push({ id: chapter.id, label: `Chapter ${(chapter.position || 0) + 1}: ${chapter.title || 'Untitled Chapter'}`, type: 'chapter' });
        }
        (chapter.scenes || []).forEach(scene => {
          if (!scene.id) return;
          const fullProseText = extractTextFromManuscriptData(scene);
          const scenePosition = scene.position || 0;
          let prosePreview = fullProseText.substring(0, 30);
          if (fullProseText.length > 30) prosePreview += '...';
          const title = scene.title || prosePreview || `Empty Scene ${scenePosition}`;
          items.push({ id: scene.id, label: title, type: 'scene' });
        });
      });
    });

    this.indexItems.set(items);
  }
}
