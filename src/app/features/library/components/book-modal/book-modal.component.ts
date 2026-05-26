import { Component, Output, EventEmitter, signal, ViewChild, ElementRef, input, computed, inject, linkedSignal, effect, output } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CdkAccordionItem, CdkAccordionModule } from '@angular/cdk/accordion';
import { CdkMenuModule } from '@angular/cdk/menu';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { BookDto, CategoryDto } from '../../../../../../shared/models/book.model';
import { BookUi } from '../../store/book.store';
import { CommonModule } from '@angular/common';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { InfoIconComponent } from '../../../../shared/components/info-icon/info-icon.component';
import { INFO_MESSAGES } from '../../../../shared/constants/info-messages';
import { LibraryService } from '../../services/library.service';
import { LibraryStore } from '../../store/book.store';
import { ConfigStore } from '../../../../core/store/config.store';
import { AutocompleteDropdownComponent, DropdownOption } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';



@Component({
  selector: 'app-book-modal',
  standalone: true,
  imports: [CdkAccordionModule, CdkMenuModule, CommonModule, TimeAgoPipe, InfoIconComponent, ReactiveFormsModule, AutocompleteDropdownComponent, RouterLink],
  templateUrl: './book-modal.component.html',
  styleUrl: './book-modal.component.scss'
})
export class BookModalComponent {
  bookInput = input.required<BookUi>({ alias: 'book' });

  book = linkedSignal(() => this.bookInput());

  close = output<void>();
  bookDeleted = output<string>();

  private libraryService = inject(LibraryService);
  readonly store = inject(LibraryStore);
  readonly config = inject(ConfigStore);
  private router = inject(Router);

  constructor() {
    // Reload book stats dynamically whenever the active book changes
    effect(() => {
      const bookId = this.book().id;
      if (bookId) {
        this.loadStats(bookId);
      }
    });
  }

  async loadStats(bookId: string) {
    try {
      const wordCount = await this.store.getWordCount('book', bookId);
      const chapterCount = await this.store.getChapterCount(bookId);
      this.animateCount(wordCount, chapterCount, 1000);
    } catch (error) {
      console.error('Failed to load dynamic book stats:', error);
    }
  }

  readonly INFO = INFO_MESSAGES;


  @ViewChild('genresContent') genresContent!: ElementRef;
  @ViewChild('tropesContent') tropesContent!: ElementRef;

  currentView = signal<'details' | 'settings'>('details');
  activeSlideModalAnimation = signal<boolean>(false);

  // Settings State
  selectedTense = signal<'past' | 'present'>('past');
  selectedLanguage = signal<string>('english');
  selectedPOV = signal<'first' | 'third_limited' | 'third_omni' | 'second'>('third_limited');
  selectedPovCharacter = signal<string | null>(null);
  characters = signal<DropdownOption[]>([]);
  useSynopsisInAiContext = signal<boolean>(false);

  // Edit Mode State
  editingField = signal<string | null>(null);
  editValue = signal<string>('');
  editArrayValue = signal<string[]>([]);

  tenses: DropdownOption[] = [
    { value: 'past', label: 'Past Tense' },
    { value: 'present', label: 'Present Tense' }
  ];

  povs: DropdownOption[] = [
    { value: 'first', label: 'First Person' },
    { value: 'second', label: 'Second Person' },
    { value: 'third_limited', label: 'Third Person Limited' },
    { value: 'third_omni', label: 'Third Person Omniscient' }
  ];

  availableTropes = ['Enemies to Lovers', 'Chosen One', 'System', 'Reincarnation', 'Time Loop', 'Magic School'];
  tropeOptions: DropdownOption[] = this.availableTropes.map(g => ({ value: g, label: g }));

  genresExpanded = signal(false);
  tropesExpanded = signal(false);

  genres = computed(() => this.book().categories?.filter((c: CategoryDto) => c.type === 'genre') || []);
  tropes = computed(() => this.book().categories?.filter((c: CategoryDto) => c.type === 'trope') || []);

  currentWords = signal(0);
  formattedSynopsis = computed(() => {
    const synopsis = this.book().synopsis;
    if (!synopsis) return [];
    return synopsis.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  });
  currentCount = signal(0); // This could be chapters if we add them to schema

  isGenresOverflow = signal(false);
  isTropesOverflow = signal(false);
  private observer?: ResizeObserver;


  ngAfterViewInit() {
    this.initObserver();
  }

  private initObserver() {
    this.observer?.disconnect();
    this.observer = new ResizeObserver(() => {
      this.checkOverflow('genres');
      this.checkOverflow('tropes');
    });

    if (this.genresContent) this.observer.observe(this.genresContent.nativeElement);
    if (this.tropesContent) this.observer.observe(this.tropesContent.nativeElement);
  }

  ngOnInit() {
    this.config.loadLanguages();
    this.config.loadGenres();
    // Initialize settings from book data if available
    const book = this.book();
    if (book.language) this.selectedLanguage.set(book.language);

    if (book.settings) {
      this.selectedTense.set(book.settings.proseTense);
      this.selectedPOV.set(book.settings.pointOfView);
      this.useSynopsisInAiContext.set(book.settings.synopsisAiContext);
      this.selectedPovCharacter.set(book.settings.povCharacterId || null);
    } else {
      this.useSynopsisInAiContext.set(book.synopsis !== '' ? true : false);
    }
  }


  ngOnDestroy() {
    this.observer?.disconnect();
  }

  private checkOverflow(type: 'genres' | 'tropes') {
    const element = type === 'genres' ? this.genresContent?.nativeElement : this.tropesContent?.nativeElement;
    if (!element) return;

    const style = window.getComputedStyle(element);
    const collapsedHeight = parseInt(style.getPropertyValue('--chips-collapsed-height')) || 96;

    const hasOverflow = element.scrollHeight > collapsedHeight;

    if (type === 'genres') {
      this.isGenresOverflow.set(hasOverflow);
    } else {
      this.isTropesOverflow.set(hasOverflow);
    }
  }

  private animateCount(targetWords: number, targetChapters: number, duration: number) {
    const startTime = performance.now();

    const update = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out expo function
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -12 * progress);

      this.currentWords.set(Math.floor(easeProgress * targetWords));
      this.currentCount.set(Math.floor(easeProgress * targetChapters));

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    requestAnimationFrame(update);
  }

  formatNumber(val: number): string {
    return new Intl.NumberFormat().format(val);
  }

  getReadingTime(): string {
    const words = this.currentWords();
    const minutes = Math.ceil(words / 250);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  onToggleGenres(accordionItem: CdkAccordionItem) {
    this.genresExpanded.set(!accordionItem.expanded);
    accordionItem.toggle();
  }

  onToggleTropes(accordionItem: CdkAccordionItem) {
    this.tropesExpanded.set(!accordionItem.expanded);
    accordionItem.toggle();
  }

  toggleView() {
    const isNowDetails = this.currentView() === 'settings';

    if (isNowDetails) {
      this.currentView.set('details');
      // Re-initialize observer after the DOM updates
      setTimeout(() => this.initObserver(), 0);
      this.activeSlideModalAnimation.set(true);
    } else {
      this.activeSlideModalAnimation.set(false);
      this.currentView.set('settings');
    }
  }

  onSelectionChange(type: 'tense' | 'language' | 'pov' | 'povCharacter', value: any) {
    if (type === 'tense') {
      this.selectedTense.set(value);
      this.saveSettings({ proseTense: value });
    } else if (type === 'language') {
      this.selectedLanguage.set(value);
      this.store.updateBook(this.book().id, { language: value });
    } else if (type === 'pov') {
      this.selectedPOV.set(value);
      this.saveSettings({ pointOfView: value });
    } else if (type === 'povCharacter') {
      this.selectedPovCharacter.set(value);
      this.saveSettings({ povCharacterId: value });
    }
  }

  toggleAiContext() {
    const newVal = !this.useSynopsisInAiContext();
    this.useSynopsisInAiContext.set(newVal);
    this.saveSettings({ synopsisAiContext: newVal });
  }

  private async saveSettings(settingsUpdate: any) {
    try {
      const currentSettings = this.book().settings || {} as any;
      const updatedBook = await this.store.updateBook(this.book().id, {
        settings: { ...currentSettings, ...settingsUpdate }
      });
      this.book.set(updatedBook);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  async onArchive() {
    try {
      const updatedBook = await this.store.updateBook(this.book().id, { status: 'archived' });
      this.book.set(updatedBook);
    } catch (error) {
      console.error('Failed to archive book:', error);
    }
  }

  async onRestore() {
    try {
      const updatedBook = await this.store.updateBook(this.book().id, { status: 'draft' });
      this.book.set(updatedBook);
    } catch (error) {
      console.error('Failed to restore book:', error);
    }
  }

  onDelete() {
    this.bookDeleted.emit(this.book().id);
  }

  onClose() {
    this.close.emit();
  }

  openManuscript() {
    this.close.emit();
    console.log("GO TO MANUSCRIPT: ", this.book().id);
    this.router.navigate(['/manuscript', 'book', this.book().id]);
  }

  // Edit Methods
  startEditing(field: string, initialValue: any) {
    this.editingField.set(field);
    if (field === 'genres' || field === 'tropes') {
      this.editArrayValue.set((initialValue as CategoryDto[]).map(c => c.name));
    } else {
      this.editValue.set(initialValue);
    }
  }

  updateEditValue(event: Event) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    this.editValue.set(target.value);
  }

  updateEditArrayValue(values: string[]) {
    this.editArrayValue.set(values);
  }

  cancelEditing() {
    this.editingField.set(null);
    this.editValue.set('');
    this.editArrayValue.set([]);
  }

  async saveEditing(field: string) {
    const updateData: any = {};

    if (field === 'genres' || field === 'tropes') {
      const isGenres = field === 'genres';
      const newNames = this.editArrayValue();
      const existingOther = isGenres ? this.tropes() : this.genres();

      const newCategories: CategoryDto[] = newNames.map(name => {
        let isCustom = true;
        if (isGenres) {
          // Check if name exists as genre or subgenre in config
          const allGenres = this.config.genres();
          const existsAsGenre = allGenres.some(g => g.value === name);
          const existsAsSubgenre = allGenres.some(g => g.subOptions?.some(s => s.value === name));
          isCustom = !existsAsGenre && !existsAsSubgenre;
        } else {
          isCustom = !this.availableTropes.includes(name);
        }

        return {
          id: crypto.randomUUID(),
          name,
          type: isGenres ? 'genre' : 'trope',
          isCustom
        };
      });

      const combinedCategories = [...existingOther, ...newCategories];
      updateData.categories = combinedCategories;
    } else {
      updateData[field] = this.editValue();
    }

    try {
      const updatedBook = await this.store.updateBook(this.book().id, updateData);
      this.book.set(updatedBook);
      this.cancelEditing();
    } catch (error) {
      console.error('Failed to save edit:', error);
    }
  }

  async onCoverImageChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64DataUrl = reader.result as string;
        try {
          const updatedBook = await this.store.updateBook(this.book().id, { coverImage: base64DataUrl });
          this.book.set(updatedBook);
        } catch (error) {
          console.error('Failed to update cover image:', error);
        }
      };
      reader.readAsDataURL(file);
    }
  }

}
