import { Component, OnDestroy, OnInit, Injector, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TiptapEditorDirective } from 'ngx-tiptap';
import { ThemeService } from '../../core/services/theme.service';
import { AutocompleteDropdownComponent, DropdownOption } from '../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { AiPromptExtension } from './components/ai-prompt/ai-node-extension';
import { EditorBubbleMenuComponent } from './components/editor-bubble-menu/editor-bubble-menu.component';
import { ActHeaderExtension, ChapterHeaderExtension } from './components/manuscript-header/manuscript-header.extension';
import { SceneSummaryExtension } from './components/scene-summary/scene-summary.extension';
import { ManuscriptStore } from './store/manuscript.store';
import { AiStore } from './store/ai.store';
import { CdkMenuModule } from '@angular/cdk/menu';
import { ManuscriptMode, ActDto, ChapterDto, SceneDto } from '../../../../shared/models/manuscript.model';

@Component({
  selector: 'app-manuscript',
  standalone: true,
  imports: [CommonModule, TiptapEditorDirective, AutocompleteDropdownComponent, EditorBubbleMenuComponent, CdkMenuModule],
  templateUrl: './manuscript.html',
  styleUrl: './manuscript.scss',
})
export class Manuscript implements OnInit, OnDestroy {
  editor: Editor | undefined;
  themeService = inject(ThemeService);
  readonly store = inject(ManuscriptStore);
  readonly aiStore = inject(AiStore);
  private route = inject(ActivatedRoute);
  private injector = inject(Injector);

  fontOptions: DropdownOption[] = [
    // Serif Group
    { value: "'Merriweather', serif", label: 'Merriweather', fontFamily: "'Merriweather', serif", group: 'Serif' },
    { value: "'EB Garamond', serif", label: 'EB Garamond', fontFamily: "'EB Garamond', serif", group: 'Serif' },
    { value: "'Lora', serif", label: 'Lora', fontFamily: "'Lora', serif", group: 'Serif' },
    { value: "'Georgia', serif", label: 'Georgia', fontFamily: "'Georgia', serif", group: 'Serif' },
    { value: "'Crimson Pro', serif", label: 'Crimson Pro', fontFamily: "'Crimson Pro', serif", group: 'Serif' },
    { value: "'Literata', serif", label: 'Literata', fontFamily: "'Literata', serif", group: 'Serif' },

    // Sans Serif Group
    { value: "'Inter', sans-serif", label: 'Inter', fontFamily: "'Inter', sans-serif", group: 'Sans Serif' },
    { value: "'Open Sans', sans-serif", label: 'Open Sans', fontFamily: "'Open Sans', sans-serif", group: 'Sans Serif' },

    // Monospace Group
    { value: "'Courier Prime', monospace", label: 'Courier Prime', fontFamily: "'Courier Prime', monospace", group: 'Monospace' },
    { value: "'Fira Code', monospace", label: 'Fira Code', fontFamily: "'Fira Code', monospace", group: 'Monospace' },
    { value: "'Source Code Pro', monospace", label: 'Source Code Pro', fontFamily: "'Source Code Pro', monospace", group: 'Monospace' },
    { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono', fontFamily: "'JetBrains Mono', monospace", group: 'Monospace' }
  ];

  ngOnInit(): void {
    this.route.params.subscribe(async params => {
      const mode = params['mode'] as ManuscriptMode;
      const id = params['id'];
      this.store.setRouteParams(mode, id);

      if (mode && id && this.editor) {
        try {
          const data = await this.store.loadManuscriptData(mode, id);
          const content = this.extractProse(mode, data);
          this.editor.commands.setContent(content);
        } catch (error) {
          console.error('Failed to load manuscript content:', error);
        }
      }
    });

    this.editor = new Editor({
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: 'Start writing or type /ai for AI assistant...',
          emptyEditorClass: 'is-editor-empty',
        }),
        AiPromptExtension(this.injector),
        ActHeaderExtension(this.injector),
        ChapterHeaderExtension(this.injector),
        SceneSummaryExtension(this.injector),
      ],
    });

    this.store.setEditor(this.editor);
    this.aiStore.loadModels();

    // Trigger initial load if params are already present
    const mode = this.route.snapshot.params['mode'] as ManuscriptMode;
    const id = this.route.snapshot.params['id'];
    if (mode && id) {
      this.store.loadManuscriptData(mode, id).then(data => {
        const content = this.extractProse(mode, data);
        this.editor?.commands.setContent(content);
      }).catch(err => console.error('Failed to load initial manuscript:', err));
    }
  }

  private escapeHtml(unsafe: string | null | undefined): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private extractProse(mode: ManuscriptMode, data: any): string {
    let content = '';

    if (mode === 'book') {
      const acts = data as ActDto[];
      acts.forEach(act => {
        content += `<act-header data-id="${act.id}" data-title="${this.escapeHtml(act.title)}" data-position="${act.position}"></act-header>`;
        if (act.prose) content += act.prose;
        act.chapters?.forEach(chapter => {
          content += `<chapter-header data-id="${chapter.id}" data-title="${this.escapeHtml(chapter.title)}" data-position="${chapter.position}"></chapter-header>`;
          if (chapter.prose) content += chapter.prose;
          chapter.scenes?.forEach(scene => {
            content += `<scene-summary data-id="${scene.id}" data-summary="${this.escapeHtml(scene.summary)}"></scene-summary>`;
            if (scene.prose) content += scene.prose;
          });
        });
      });
    } else if (mode === 'act') {
      const act = data as ActDto;
      content += `<act-header data-id="${act.id}" data-title="${this.escapeHtml(act.title)}" data-position="${act.position}"></act-header>`;
      if (act.prose) content += act.prose;
      act.chapters?.forEach(chapter => {
        content += `<chapter-header data-id="${chapter.id}" data-title="${this.escapeHtml(chapter.title)}" data-position="${chapter.position}"></chapter-header>`;
        if (chapter.prose) content += chapter.prose;
        chapter.scenes?.forEach(scene => {
          content += `<scene-summary data-id="${scene.id}" data-summary="${this.escapeHtml(scene.summary)}"></scene-summary>`;
          if (scene.prose) content += scene.prose;
        });
      });
    } else if (mode === 'chapter') {
      const chapter = data as ChapterDto;
      content += `<chapter-header data-id="${chapter.id}" data-title="${this.escapeHtml(chapter.title)}" data-position="${chapter.position}"></chapter-header>`;
      if (chapter.prose) content += chapter.prose;
      chapter.scenes?.forEach(scene => {
        content += `<scene-summary data-id="${scene.id}" data-summary="${this.escapeHtml(scene.summary)}"></scene-summary>`;
        if (scene.prose) content += scene.prose;
      });
    } else if (mode === 'scene') {
      const scene = data as SceneDto;
      content += `<scene-summary data-id="${scene.id}" data-summary="${this.escapeHtml(scene.summary)}"></scene-summary>`;
      if (scene.prose) content += scene.prose;
    }

    return content || '<p></p>';
  }

  getActiveFormatLabel(): string {
    if (!this.editor) return 'Normal Text';
    if (this.editor.isActive('heading', { level: 1 })) return 'Heading 1';
    if (this.editor.isActive('heading', { level: 2 })) return 'Heading 2';
    if (this.editor.isActive('heading', { level: 3 })) return 'Heading 3';
    if (this.editor.isActive('heading', { level: 4 })) return 'Heading 4';
    return 'Normal Text';
  }

  insertAct(): void {
    if (!this.editor) return;
    const endPosition = this.editor.state.doc.content.size;
    this.editor.chain().focus().insertContentAt(endPosition,
      '<act-header></act-header><chapter-header></chapter-header><p></p>').run();
  }

  insertChapter(): void {
    if (!this.editor) return;
    const endPosition = this.editor.state.doc.content.size;
    this.editor.chain().focus().insertContentAt(endPosition, '<chapter-header></chapter-header><p></p>').run();
  }

  insertScene(): void {
    if (!this.editor) return;
    const endPosition = this.editor.state.doc.content.size;
    // For now, inserting a scene just adds a paragraph, as scene markers are not explicit nodes yet.
    // Alternatively, it can just insert a paragraph break.
    this.editor.chain().focus().insertContentAt(endPosition, '<p></p>').run();
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
    this.store.setEditor(null);
  }
}
