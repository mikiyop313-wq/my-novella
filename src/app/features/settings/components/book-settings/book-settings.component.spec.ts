import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookDto, UpdateBookDto } from '../../../../../../shared/models/book.model';
import { ThemeService, type Theme } from '../../../../core/services/theme.service';
import { ConfigStore } from '../../../../core/store/config.store';
import { ToastService } from '../../../../shared/services/toast.service';
import { SystemPromptSelectionService } from '../../../../shared/services/system-prompt-selection.service';
import { CodexService } from '../../../codex/services/codex.service';
import { LibraryService } from '../../../library/services/library.service';
import { ManuscriptStructureService } from '../../../workspace/services/manuscript-structure.service';
import { WorkspaceStore } from '../../../workspace/workspace.store';
import { ArchiveSettingsComponent } from '../archive-settings/archive-settings.component';
import { SystemPromptSettingsComponent } from '../system-prompt-settings/system-prompt-settings.component';
import { SystemPromptService } from '../../services/system-prompt.service';
import { BookSettingsComponent } from './book-settings.component';

describe('BookSettingsComponent', () => {
  const originalStartViewTransition = Object.getOwnPropertyDescriptor(
    document,
    'startViewTransition',
  );
  const originalAnimate = Object.getOwnPropertyDescriptor(document.documentElement, 'animate');

  let fixture: ComponentFixture<BookSettingsComponent>;
  let bookId: WritableSignal<string | null>;
  let lastWorkspaceUrl: WritableSignal<string | null>;
  let bookTitle: WritableSignal<string>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let getBooks: ReturnType<typeof vi.fn>;
  let updateBook: ReturnType<typeof vi.fn>;
  let getCodexEntries: ReturnType<typeof vi.fn>;
  let getArchiveOverview: ReturnType<typeof vi.fn>;
  let getBookHierarchy: ReturnType<typeof vi.fn>;
  let setBookTitle: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let loadLanguages: ReturnType<typeof vi.fn>;
  let loadGenres: ReturnType<typeof vi.fn>;
  let loadTropes: ReturnType<typeof vi.fn>;
  let currentTheme: WritableSignal<Theme>;
  let setTheme: ReturnType<typeof vi.fn>;

  const book: BookDto = {
    id: 'book-1',
    title: 'The Glass Orchard',
    author: 'Mira Vale',
    status: 'draft',
    synopsis: 'A botanist discovers a garden that remembers every visitor.',
    coverImage: null,
    wordCount: 1200,
    language: 'english',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-02T00:00:00.000Z',
    categories: [
      {
        id: 'genre-1',
        name: 'Fantasy',
        type: 'genre',
        isCustom: false,
      },
      {
        id: 'trope-1',
        name: 'Found Family',
        type: 'trope',
        isCustom: false,
      },
      {
        id: 'demographic-1',
        name: 'Adult',
        type: 'demographic',
        isCustom: false,
      },
    ],
    settings: {
      language: 'english',
      proseTense: 'past',
      pointOfView: 'third_limited',
      synopsisAiContext: true,
      povCharacterId: 'character-1',
    },
  };

  beforeEach(async () => {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => void) => {
        update();
        return {
          ready: Promise.resolve(),
          finished: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition: vi.fn(),
        } as unknown as ViewTransition;
      },
    });
    Object.defineProperty(document.documentElement, 'animate', {
      configurable: true,
      value: vi.fn(),
    });

    bookId = signal<string | null>('book-1');
    lastWorkspaceUrl = signal<string | null>('/workspace/book-1/manuscript/book/book-1');
    bookTitle = signal('The Glass Orchard');
    navigateByUrl = vi.fn().mockResolvedValue(true);
    getBooks = vi.fn().mockResolvedValue([book]);
    getCodexEntries = vi.fn().mockResolvedValue([
      {
        id: 'character-1',
        bookId: 'book-1',
        type: 'character',
        name: 'Lina Vale',
        alias: null,
        description: null,
        image: null,
        status: 'active',
        trackingSetting: 'include_when_detected',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastEditedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    getArchiveOverview = vi.fn().mockResolvedValue({
      archivedActs: [],
      archivedChapters: [],
      archivedScenes: [],
    });
    getBookHierarchy = vi.fn().mockResolvedValue([]);
    setBookTitle = vi.fn((title: string) => bookTitle.set(title));
    toastError = vi.fn();
    loadLanguages = vi.fn().mockResolvedValue(undefined);
    loadGenres = vi.fn().mockResolvedValue(undefined);
    loadTropes = vi.fn().mockResolvedValue(undefined);
    currentTheme = signal<Theme>('light');
    setTheme = vi.fn((theme: Theme) => currentTheme.set(theme));
    updateBook = vi.fn().mockImplementation(
      async (_id: string, update: UpdateBookDto): Promise<BookDto> => ({
        ...book,
        ...update,
        lastEditedAt: '2026-01-03T00:00:00.000Z',
      }),
    );

    await TestBed.configureTestingModule({
      imports: [BookSettingsComponent],
      providers: [
        {
          provide: WorkspaceStore,
          useValue: {
            bookId,
            bookTitle,
            lastWorkspaceUrl,
            setBookTitle,
          },
        },
        {
          provide: LibraryService,
          useValue: { getBooks, updateBook },
        },
        {
          provide: CodexService,
          useValue: { getEntries: getCodexEntries },
        },
        {
          provide: ManuscriptStructureService,
          useValue: {
            getArchiveOverview,
            getBookHierarchy,
            restoreAct: vi.fn(),
            restoreChapter: vi.fn(),
            restoreScene: vi.fn(),
          },
        },
        {
          provide: ConfigStore,
          useValue: {
            languages: signal([
              { value: 'english', label: 'English' },
              { value: 'romanian', label: 'Romanian' },
            ]),
            genres: signal([
              {
                value: 'Fantasy',
                label: 'Fantasy',
                subOptions: [{ value: 'Dark Fantasy', label: 'Dark Fantasy' }],
              },
            ]),
            tropes: signal([
              { value: 'Found Family', label: 'Found Family' },
              {
                value: 'Romance',
                label: 'Romance',
                subOptions: [{ value: 'Enemies to Lovers', label: 'Enemies to Lovers' }],
              },
            ]),
            loadLanguages,
            loadGenres,
            loadTropes,
          },
        },
        {
          provide: ToastService,
          useValue: { error: toastError },
        },
        {
          provide: ThemeService,
          useValue: { currentTheme, setTheme },
        },
        {
          provide: SystemPromptService,
          useValue: {
            listAvailable: vi.fn().mockResolvedValue([]),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          },
        },
        {
          provide: SystemPromptSelectionService,
          useValue: {
            getActivePresetIds: vi.fn().mockResolvedValue({
              chat: 'default-assistant',
              sceneBeat: 'default-scene-beat',
              rephrase: 'default-rephrase',
              summary: 'default-summary',
              expand: 'default-expand',
              shorten: 'default-shorten',
              title: 'default-title',
            }),
          },
        },
        {
          provide: Router,
          useValue: { navigateByUrl },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookSettingsComponent);
    fixture.detectChanges();
    await fixture.componentInstance.loadSettings();
    fixture.detectChanges();
  });

  afterEach(() => {
    restoreProperty(document, 'startViewTransition', originalStartViewTransition);
    restoreProperty(document.documentElement, 'animate', originalAnimate);
  });

  it('loads the active book and renders all editable metadata sections', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(getBooks).toHaveBeenCalled();
    expect(loadLanguages).toHaveBeenCalled();
    expect(loadGenres).toHaveBeenCalled();
    expect(loadTropes).toHaveBeenCalled();
    expect(getCodexEntries).toHaveBeenCalledWith('book-1', {
      type: 'character',
      status: 'active',
    });
    expect(element.querySelectorAll('.setting-card')).toHaveLength(3);
    expect(element.textContent).toContain('The Glass Orchard');
    expect(element.textContent).toContain('Mira Vale');
    expect(element.textContent).toContain('English');
    expect(element.textContent).toContain('Past Tense');
    expect(element.textContent).toContain('Third Person Limited');
    expect(element.textContent).toContain('Lina Vale');
    expect(element.textContent).toContain('Fantasy');
    expect(element.textContent).toContain('Found Family');
    expect(element.querySelector('.placeholder-panel')).toBeNull();
  });

  it('keeps identity concise and groups language with prose settings', () => {
    const element = fixture.nativeElement as HTMLElement;
    const identityRows = element.querySelectorAll(
      '[aria-labelledby="book-identity-heading"] .setting-row',
    );
    const proseRows = element.querySelectorAll('[aria-labelledby="prose-heading"] .setting-row');

    expect(identityRows).toHaveLength(2);
    expect(proseRows).toHaveLength(4);
    expect(identityRows[0]?.querySelector('.setting-copy p')?.textContent).toContain('Book title');
    expect(identityRows[1]?.querySelector('.setting-copy p')?.textContent).toContain(
      'Book author name',
    );
    expect(proseRows[0]?.querySelector('h3')?.textContent).toContain('Language');

    fixture.componentInstance.startEditing('language');
    fixture.detectChanges();

    const dropdown = fixture.debugElement.query(
      (debugElement) =>
        debugElement.name === 'app-autocomplete-dropdown' &&
        debugElement.componentInstance.grouped?.(),
    );
    expect(dropdown).not.toBeNull();

    fixture.componentInstance.cancelEditing();
    fixture.componentInstance.startEditing('genres');
    fixture.detectChanges();

    const genresDropdown = fixture.debugElement.query(
      (debugElement) => debugElement.name === 'app-autocomplete-dropdown',
    );
    expect(genresDropdown.componentInstance.grouped()).toBe(false);
  });

  it('renders the navigation sections and keeps General active', () => {
    const element = fixture.nativeElement as HTMLElement;
    const activeSections = element.querySelectorAll('.section-item.is-active');
    const sections = element.querySelectorAll('.section-item');

    expect(sections).toHaveLength(4);
    expect(element.querySelectorAll('.section-item > .active-indicator')).toHaveLength(4);
    expect(activeSections).toHaveLength(1);
    expect(activeSections[0]?.getAttribute('aria-current')).toBe('page');
    expect(element.querySelector('.settings-divider')).not.toBeNull();
  });

  it('loads the persistent preset editor with the active book when System Prompts is selected', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const sections = element.querySelectorAll<HTMLButtonElement>('.section-item');

    sections[1].click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSection()).toBe('system-prompts');
    const promptSettings = fixture.debugElement.query(By.directive(SystemPromptSettingsComponent))
      .componentInstance as SystemPromptSettingsComponent;
    await promptSettings.loadPresets();
    fixture.detectChanges();
    expect(promptSettings.bookId()).toBe('book-1');
    expect(element.querySelector('.content-title')?.textContent).toContain('System Prompts');
    expect(element.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(sections[1].getAttribute('aria-current')).toBe('page');
  });

  it('loads the archive manager when Archive is selected', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const sections = element.querySelectorAll<HTMLButtonElement>('.section-item');

    sections[3].click();
    fixture.detectChanges();
    const archiveComponent = fixture.debugElement.query(By.directive(ArchiveSettingsComponent))
      .componentInstance as ArchiveSettingsComponent;
    await archiveComponent.store.load('book-1');
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSection()).toBe('archive');
    expect(getArchiveOverview).toHaveBeenCalledWith('book-1');
    expect(getBookHierarchy).toHaveBeenCalledWith('book', 'book-1');
    expect(element.querySelector('app-archive-settings')).not.toBeNull();
    expect(element.querySelector('.content-title')?.textContent).toContain('Archive');
    expect(element.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(sections[3].getAttribute('aria-current')).toBe('page');
  });

  it('switches themes from the Editor & Display section', () => {
    const element = fixture.nativeElement as HTMLElement;
    const sections = element.querySelectorAll<HTMLButtonElement>('.section-item');

    sections[2].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSection()).toBe('editor-display');
    expect(element.querySelectorAll('.settings-section-panel')).toHaveLength(1);
    expect(element.querySelector('.content-title')?.textContent).toContain('Editor & Display');
    expect(element.querySelectorAll('.theme-option')).toHaveLength(2);
    expect(element.querySelector('.theme-option.is-light')?.getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(sections[2].getAttribute('aria-current')).toBe('page');

    element.querySelector<HTMLButtonElement>('.theme-option.is-dark')?.click();
    fixture.detectChanges();

    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(currentTheme()).toBe('dark');
    expect(element.querySelector('.theme-option.is-dark')?.getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('reveals the selected theme with a circle expanding from the top-left corner', async () => {
    const ready = Promise.resolve();
    const finished = Promise.resolve();
    const animate = vi.fn();
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      return {
        ready,
        finished,
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn(),
      } as unknown as ViewTransition;
    });

    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    });
    Object.defineProperty(document.documentElement, 'animate', {
      configurable: true,
      value: animate,
    });

    fixture.componentInstance.setTheme('dark');
    await Promise.all([ready, finished]);
    await Promise.resolve();

    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(animate).toHaveBeenCalledWith(
      {
        clipPath: [
          'circle(0px at 0px 0px)',
          `circle(${Math.hypot(window.innerWidth, window.innerHeight)}px at 0px 0px)`,
        ],
      },
      {
        duration: 500,
        easing: 'ease-in-out',
        pseudoElement: '::view-transition-new(root)',
      },
    );
    expect(document.documentElement.classList.contains('theme-transition')).toBe(false);
  });

  it('requires and trims the title before saving it', async () => {
    const component = fixture.componentInstance;
    component.startEditing('title');
    component.editValue.set('   ');

    await component.saveEditing();

    expect(updateBook).not.toHaveBeenCalled();
    expect(component.validationError()).toBe('Title is required.');

    component.editValue.set('  A New Title  ');
    await component.saveEditing();

    expect(updateBook).toHaveBeenCalledWith('book-1', { title: 'A New Title' });
    expect(setBookTitle).toHaveBeenCalledWith('A New Title');
    expect(component.book()?.title).toBe('A New Title');
    expect(component.editingField()).toBeNull();
  });

  it('saves trimmed author changes independently', async () => {
    const component = fixture.componentInstance;
    component.startEditing('author');
    component.editValue.set('  Rowan Hart  ');

    await component.saveEditing();

    expect(updateBook).toHaveBeenCalledWith('book-1', { author: 'Rowan Hart' });
  });

  it('allows the synopsis to be cleared', async () => {
    const component = fixture.componentInstance;
    component.startEditing('synopsis');
    component.editValue.set('   ');

    await component.saveEditing();

    expect(updateBook).toHaveBeenCalledWith('book-1', { synopsis: '' });
    expect(component.book()?.synopsis).toBe('');
  });

  it('saves a selected language', async () => {
    const component = fixture.componentInstance;
    component.startEditing('language');
    component.updateEditSelection('romanian');

    await component.saveEditing();

    expect(updateBook).toHaveBeenCalledWith('book-1', { language: 'romanian' });
    expect(component.languageLabel('romanian')).toBe('Romanian');
  });

  it('saves prose settings while preserving the other book settings', async () => {
    const component = fixture.componentInstance;

    component.startEditing('proseTense');
    component.updateEditSelection('present');
    await component.saveEditing();

    expect(updateBook).toHaveBeenLastCalledWith('book-1', {
      settings: {
        ...book.settings,
        proseTense: 'present',
      },
    });

    component.startEditing('pointOfView');
    component.updateEditSelection('first');
    await component.saveEditing();

    expect(updateBook).toHaveBeenLastCalledWith('book-1', {
      settings: {
        ...book.settings,
        proseTense: 'present',
        pointOfView: 'first',
      },
    });

    component.startEditing('povCharacterId');
    component.updateEditSelection('');
    await component.saveEditing();

    expect(updateBook).toHaveBeenLastCalledWith('book-1', {
      settings: {
        ...book.settings,
        proseTense: 'present',
        pointOfView: 'first',
        povCharacterId: null,
      },
    });
  });

  it('can clear genres without removing tropes or demographic categories', async () => {
    const component = fixture.componentInstance;
    component.startEditing('genres');
    component.updateEditArrayValue([]);

    await component.saveEditing();

    const categories = updateBook.mock.calls[0][1].categories;
    expect(categories).toEqual([
      expect.objectContaining({ name: 'Found Family', type: 'trope' }),
      expect.objectContaining({ name: 'Adult', type: 'demographic' }),
    ]);
  });

  it('identifies predefined, nested, and custom tropes while preserving other categories', async () => {
    const component = fixture.componentInstance;
    component.startEditing('tropes');
    component.updateEditArrayValue(['Found Family', 'Enemies to Lovers', 'Secret Heir']);

    await component.saveEditing();

    const categories = updateBook.mock.calls[0][1].categories;
    expect(categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Fantasy', type: 'genre' }),
        expect.objectContaining({ name: 'Adult', type: 'demographic' }),
        expect.objectContaining({
          name: 'Found Family',
          type: 'trope',
          isCustom: false,
        }),
        expect.objectContaining({
          name: 'Enemies to Lovers',
          type: 'trope',
          isCustom: false,
        }),
        expect.objectContaining({
          name: 'Secret Heir',
          type: 'trope',
          isCustom: true,
        }),
      ]),
    );
  });

  it('keeps the editor open and reports a failed save', async () => {
    updateBook.mockRejectedValueOnce(new Error('Database unavailable'));
    const component = fixture.componentInstance;
    component.startEditing('author');
    component.editValue.set('New Author');

    await component.saveEditing();

    expect(component.editingField()).toBe('author');
    expect(component.editValue()).toBe('New Author');
    expect(toastError).toHaveBeenCalledWith('Database unavailable', 'Settings update failed');
  });

  it('cancels the active edit on Escape before closing settings', () => {
    const component = fixture.componentInstance;
    component.startEditing('synopsis');

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(component.editingField()).toBeNull();
    expect(navigateByUrl).not.toHaveBeenCalled();

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(navigateByUrl).toHaveBeenCalledWith('/workspace/book-1/manuscript/book/book-1');
  });

  it('shows a retryable not-found state', async () => {
    getBooks.mockResolvedValueOnce([]);

    await fixture.componentInstance.loadSettings();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'This book could not be found.',
    );
    expect(element.querySelector('.secondary-button')?.textContent).toContain('Retry');
  });

  it('shows a retryable load error', async () => {
    getBooks.mockRejectedValueOnce(new Error('Library unavailable'));

    await fixture.componentInstance.loadSettings();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('Library unavailable');
  });

  it('focuses the back button when settings opens', () => {
    const backButton = fixture.nativeElement.querySelector(
      '.settings-back-button',
    ) as HTMLButtonElement;

    expect(document.activeElement).toBe(backButton);
  });

  it('returns to the latest workspace route from the back button', () => {
    const backButton = fixture.nativeElement.querySelector(
      '.settings-back-button',
    ) as HTMLButtonElement;

    backButton.click();

    expect(navigateByUrl).toHaveBeenCalledWith('/workspace/book-1/manuscript/book/book-1');
  });

  it('falls back to the book outline when no safe return route exists', () => {
    lastWorkspaceUrl.set('/workspace/another-book/outline');

    fixture.componentInstance.closeSettings();

    expect(navigateByUrl).toHaveBeenCalledWith('/workspace/book-1/outline');
  });

  function restoreProperty(
    target: object,
    name: PropertyKey,
    descriptor: PropertyDescriptor | undefined,
  ): void {
    if (descriptor) {
      Object.defineProperty(target, name, descriptor);
    } else {
      Reflect.deleteProperty(target, name);
    }
  }
});
