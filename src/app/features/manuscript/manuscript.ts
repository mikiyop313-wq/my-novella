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
import { ManuscriptStore } from './store/manuscript.store';
import { AiStore } from './store/ai.store';

@Component({
  selector: 'app-manuscript',
  standalone: true,
  imports: [CommonModule, TiptapEditorDirective, AutocompleteDropdownComponent, EditorBubbleMenuComponent],
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
    // Get book ID from query params
    this.route.queryParams.subscribe(params => {
      const id = params['bookId'];
      this.store.setBookId(id || null);
    });

    this.editor = new Editor({
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: 'Start writing or type /ai for AI assistant...',
          emptyEditorClass: 'is-editor-empty',
        }),
        AiPromptExtension(this.injector),
      ],
    });

    this.store.setEditor(this.editor);
    this.aiStore.loadModels();
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
    this.store.setEditor(null);
  }
}
