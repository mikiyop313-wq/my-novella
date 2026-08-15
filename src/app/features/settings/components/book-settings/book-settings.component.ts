import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import {
  BookDto,
  BookSettingsDto,
  CategoryDto,
  UpdateBookDto,
} from '../../../../../../shared/models/book.model';
import { ThemeService, type Theme } from '../../../../core/services/theme.service';
import { ConfigStore } from '../../../../core/store/config.store';
import {
  AutocompleteDropdownComponent,
  DropdownOption,
} from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { CodexService } from '../../../codex/services/codex.service';
import { LibraryService } from '../../../library/services/library.service';
import { WorkspaceStore } from '../../../workspace/workspace.store';
import { ArchiveSettingsComponent } from '../archive-settings/archive-settings.component';
import { SystemPromptSettingsComponent } from '../system-prompt-settings/system-prompt-settings.component';

type EditableField =
  | 'title'
  | 'author'
  | 'synopsis'
  | 'language'
  | 'proseTense'
  | 'pointOfView'
  | 'povCharacterId'
  | 'genres'
  | 'tropes';

type SettingsSection = 'general' | 'system-prompts' | 'editor-display' | 'archive';

@Component({
  selector: 'app-book-settings',
  imports: [ArchiveSettingsComponent, AutocompleteDropdownComponent, SystemPromptSettingsComponent],
  templateUrl: './book-settings.component.html',
  styleUrl: '../../styles/settings.shared.scss',
  host: { class: 'book-settings-panel' },
})
export class BookSettingsComponent implements OnInit, AfterViewInit {
  private readonly router = inject(Router);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly libraryService = inject(LibraryService);
  private readonly codexService = inject(CodexService);
  private readonly toastService = inject(ToastService);
  readonly themeService = inject(ThemeService);
  readonly config = inject(ConfigStore);

  readonly activeSection = signal<SettingsSection>('general');
  readonly activeBookId = computed(() => this.workspaceStore.bookId());
  readonly book = signal<BookDto | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly editingField = signal<EditableField | null>(null);
  readonly editValue = signal('');
  readonly editArrayValue = signal<string[]>([]);
  readonly isSaving = signal(false);
  readonly validationError = signal<string | null>(null);
  readonly characters = signal<DropdownOption[]>([]);

  readonly tenses: DropdownOption[] = [
    { value: 'past', label: 'Past Tense' },
    { value: 'present', label: 'Present Tense' },
  ];
  readonly pointsOfView: DropdownOption[] = [
    { value: 'first', label: 'First Person' },
    { value: 'second', label: 'Second Person' },
    { value: 'third_limited', label: 'Third Person Limited' },
    { value: 'third_omni', label: 'Third Person Omniscient' },
  ];
  readonly povCharacterOptions = computed<DropdownOption[]>(() => [
    { value: '', label: 'None' },
    ...this.characters(),
  ]);

  readonly genres = computed(
    () => this.book()?.categories?.filter((category) => category.type === 'genre') ?? [],
  );
  readonly tropes = computed(
    () => this.book()?.categories?.filter((category) => category.type === 'trope') ?? [],
  );

  @ViewChild('backButton')
  private backButton?: ElementRef<HTMLButtonElement>;

  ngOnInit(): void {
    void this.loadSettings();
  }

  ngAfterViewInit(): void {
    this.backButton?.nativeElement.focus();
  }

  async loadSettings(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    const bookId = this.workspaceStore.bookId();
    if (!bookId) {
      this.book.set(null);
      this.loadError.set('No active book is available for these settings.');
      this.isLoading.set(false);
      return;
    }

    try {
      const [books] = await Promise.all([
        this.libraryService.getBooks(),
        this.loadCharacters(bookId),
        this.config.loadLanguages(),
        this.config.loadGenres(),
        this.config.loadTropes(),
      ]);
      const activeBook = books.find((candidate) => candidate.id === bookId);

      if (!activeBook) {
        this.book.set(null);
        this.loadError.set('This book could not be found.');
        return;
      }

      this.book.set(activeBook);
    } catch (error) {
      this.book.set(null);
      this.loadError.set(error instanceof Error ? error.message : 'Unable to load book settings.');
    } finally {
      this.isLoading.set(false);
    }
  }

  startEditing(field: EditableField): void {
    const book = this.book();
    if (!book || this.isSaving()) return;

    this.editingField.set(field);
    this.validationError.set(null);

    if (field === 'genres' || field === 'tropes') {
      const categoryType = field === 'genres' ? 'genre' : 'trope';
      this.editArrayValue.set(
        book.categories
          ?.filter((category) => category.type === categoryType)
          .map((category) => category.name) ?? [],
      );
      this.editValue.set('');
      return;
    }

    this.editArrayValue.set([]);
    this.editValue.set(this.fieldValue(field, book));
  }

  updateEditValue(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    this.editValue.set(target.value);
    this.validationError.set(null);
  }

  updateEditSelection(value: unknown): void {
    this.editValue.set(typeof value === 'string' ? value : '');
    this.validationError.set(null);
  }

  updateEditArrayValue(values: unknown): void {
    this.editArrayValue.set(
      Array.isArray(values)
        ? values.filter((value): value is string => typeof value === 'string')
        : [],
    );
    this.validationError.set(null);
  }

  cancelEditing(): void {
    if (this.isSaving()) return;

    this.editingField.set(null);
    this.editValue.set('');
    this.editArrayValue.set([]);
    this.validationError.set(null);
  }

  async saveEditing(): Promise<void> {
    const field = this.editingField();
    const book = this.book();
    if (!field || !book || this.isSaving()) return;

    const update = this.buildUpdate(field, book);
    if (!update) return;

    this.isSaving.set(true);
    try {
      const updatedBook = await this.libraryService.updateBook(book.id, update);
      this.book.set(updatedBook);
      if (field === 'title') {
        this.workspaceStore.setBookTitle(updatedBook.title);
      }
      this.editingField.set(null);
      this.editValue.set('');
      this.editArrayValue.set([]);
      this.validationError.set(null);
    } catch (error) {
      this.toastService.error(
        error instanceof Error ? error.message : 'Unable to save this setting.',
        'Settings update failed',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  languageLabel(language: string): string {
    return this.config.languages().find((option) => option.value === language)?.label ?? language;
  }

  proseTenseLabel(tense: BookSettingsDto['proseTense'] | undefined): string {
    return this.optionLabel(this.tenses, tense, 'Past Tense');
  }

  pointOfViewLabel(pointOfView: BookSettingsDto['pointOfView'] | undefined): string {
    return this.optionLabel(this.pointsOfView, pointOfView, 'Third Person Limited');
  }

  povCharacterLabel(characterId: string | null | undefined): string {
    if (!characterId) return 'None';

    return (
      this.characters().find((option) => option.value === characterId)?.label ??
      'Unavailable character'
    );
  }

  selectSection(section: SettingsSection): void {
    if (section === this.activeSection()) return;

    this.cancelEditing();
    this.activeSection.set(section);
  }

  setTheme(theme: Theme): void {
    if (theme === this.themeService.currentTheme()) return;

    document.documentElement.classList.add('theme-transition');

    const transition = document.startViewTransition(() => {
      this.themeService.setTheme(theme);
    });

    void transition.ready
      .then(() => {
        const endRadius = Math.hypot(window.innerWidth, window.innerHeight);
        document.documentElement.animate(
          {
            clipPath: ['circle(0px at 0px 0px)', `circle(${endRadius}px at 0px 0px)`],
          },
          {
            duration: 500,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => undefined);

    void transition.finished
      .finally(() => {
        document.documentElement.classList.remove('theme-transition');
      })
      .catch(() => undefined);
  }

  closeSettings(): void {
    const bookId = this.workspaceStore.bookId();
    if (!bookId) {
      void this.router.navigateByUrl('/library');
      return;
    }

    const workspacePrefix = `/workspace/${bookId}/`;
    const lastWorkspaceUrl = this.workspaceStore.lastWorkspaceUrl();
    const returnUrl =
      lastWorkspaceUrl?.startsWith(workspacePrefix) && !lastWorkspaceUrl.includes('/settings')
        ? lastWorkspaceUrl
        : `${workspacePrefix}outline`;

    void this.router.navigateByUrl(returnUrl);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    event.preventDefault();
    if (this.editingField()) {
      event.stopPropagation();
      this.cancelEditing();
      return;
    }

    this.closeSettings();
  }

  private buildUpdate(field: EditableField, book: BookDto): UpdateBookDto | null {
    if (field === 'title' || field === 'author') {
      const value = this.editValue().trim();
      if (!value) {
        this.validationError.set(`${field === 'title' ? 'Title' : 'Author'} is required.`);
        return null;
      }
      return { [field]: value };
    }

    if (field === 'synopsis') {
      return { synopsis: this.editValue().trim() };
    }

    if (field === 'language') {
      const language = this.editValue().trim();
      if (!language) {
        this.validationError.set('Language is required.');
        return null;
      }
      return { language };
    }

    if (field === 'proseTense') {
      const proseTense = this.editValue();
      if (proseTense !== 'past' && proseTense !== 'present') {
        this.validationError.set('Prose tense is required.');
        return null;
      }
      return {
        settings: this.mergeSettings(book, { proseTense }),
      };
    }

    if (field === 'pointOfView') {
      const pointOfView = this.editValue();
      if (
        pointOfView !== 'first' &&
        pointOfView !== 'second' &&
        pointOfView !== 'third_limited' &&
        pointOfView !== 'third_omni'
      ) {
        this.validationError.set('Point of view is required.');
        return null;
      }
      return {
        settings: this.mergeSettings(book, { pointOfView }),
      };
    }

    if (field === 'povCharacterId') {
      return {
        settings: this.mergeSettings(book, {
          povCharacterId: this.editValue() || null,
        }),
      };
    }

    return {
      categories: this.buildCategories(
        book.categories ?? [],
        field === 'genres' ? 'genre' : 'trope',
        this.editArrayValue(),
      ),
    };
  }

  private async loadCharacters(bookId: string): Promise<void> {
    try {
      const characters = await this.codexService.getEntries(bookId, {
        type: 'character',
        status: 'active',
      });
      this.characters.set(
        characters.map((character) => ({
          value: character.id,
          label: character.name,
        })),
      );
    } catch {
      this.characters.set([]);
    }
  }

  private fieldValue(field: EditableField, book: BookDto): string {
    switch (field) {
      case 'synopsis':
        return book.synopsis ?? '';
      case 'proseTense':
        return book.settings?.proseTense ?? 'past';
      case 'pointOfView':
        return book.settings?.pointOfView ?? 'third_limited';
      case 'povCharacterId':
        return book.settings?.povCharacterId ?? '';
      case 'title':
        return book.title;
      case 'author':
        return book.author;
      case 'language':
        return book.language;
      case 'genres':
      case 'tropes':
        return '';
    }
  }

  private mergeSettings(book: BookDto, update: Partial<BookSettingsDto>): BookSettingsDto {
    return {
      language: book.settings?.language ?? book.language,
      proseTense: book.settings?.proseTense ?? 'past',
      pointOfView: book.settings?.pointOfView ?? 'third_limited',
      synopsisAiContext: book.settings?.synopsisAiContext ?? Boolean(book.synopsis?.trim()),
      ...book.settings,
      ...update,
    };
  }

  private optionLabel(
    options: readonly DropdownOption[],
    value: string | undefined,
    fallback: string,
  ): string {
    return options.find((option) => option.value === value)?.label ?? fallback;
  }

  private buildCategories(
    currentCategories: CategoryDto[],
    editedType: 'genre' | 'trope',
    selectedNames: string[],
  ): CategoryDto[] {
    const untouchedCategories = currentCategories.filter(
      (category) => category.type !== editedType,
    );
    const existingByName = new Map(
      currentCategories
        .filter((category) => category.type === editedType)
        .map((category) => [category.name, category]),
    );
    const uniqueNames = [...new Set(selectedNames.map((name) => name.trim()).filter(Boolean))];

    const editedCategories = uniqueNames.map((name) => {
      const existing = existingByName.get(name);
      return {
        id: existing?.id ?? crypto.randomUUID(),
        name,
        type: editedType,
        isCustom: editedType === 'trope' ? !this.optionExists(this.config.tropes(), name) : false,
      } satisfies CategoryDto;
    });

    return [...untouchedCategories, ...editedCategories];
  }

  private optionExists(options: readonly DropdownOption[], value: string): boolean {
    return options.some(
      (option) =>
        option.value === value ||
        (option.subOptions ? this.optionExists(option.subOptions, value) : false),
    );
  }
}
