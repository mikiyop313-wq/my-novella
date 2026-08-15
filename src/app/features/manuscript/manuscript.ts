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

export interface FormattingSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  textIndent: number;
  pageWidth: 'narrow' | 'medium' | 'wide';
}

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
  private route = inject(ActivatedRoute);
  private injector = inject(Injector);

  // Active book ID from route
  bookId = signal<string | null>(null);

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

  // Formatting state
  settings = signal<FormattingSettings>({
    fontFamily: "'Merriweather', serif",
    fontSize: 18,
    lineHeight: 1.8,
    paragraphSpacing: 24,
    textAlign: 'left',
    textIndent: 0,
    pageWidth: 'medium',
  });

  // Sidebar visibility
  showFormatMenu = signal(true);

  ngOnInit(): void {
    // Get book ID from query params
    this.route.queryParams.subscribe(params => {
      const id = params['bookId'];
      this.bookId.set(id || null);
      this.loadSettings(id);
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
  }

  private loadSettings(id?: string) {
    const key = id ? `manuscript_format_${id}` : 'manuscript_format_global';
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.settings.set({ ...this.settings(), ...parsed });
      } catch (e) {
        console.error('Failed to parse saved formatting settings', e);
      }
    }
  }

  updateSetting<K extends keyof FormattingSettings>(key: K, value: FormattingSettings[K]) {
    this.settings.update(s => {
      const newSettings = { ...s, [key]: value };
      const id = this.bookId();
      const storageKey = id ? `manuscript_format_${id}` : 'manuscript_format_global';
      localStorage.setItem(storageKey, JSON.stringify(newSettings));
      return newSettings;
    });
  }

  toggleFormatMenu() {
    this.showFormatMenu.update(v => !v);
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }
}
