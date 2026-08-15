import { Component, Output, EventEmitter, signal, ViewChild, ElementRef, input, computed, inject, linkedSignal } from '@angular/core';
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
import { ElectronService } from '../../../../core/services/electron.service';



@Component({
  selector: 'app-book-modal',
  standalone: true,
  imports: [CdkAccordionModule, CdkMenuModule, CommonModule, TimeAgoPipe, InfoIconComponent, ReactiveFormsModule, AutocompleteDropdownComponent],
  templateUrl: './book-modal.component.html',
  styleUrl: './book-modal.component.scss'
})
export class BookModalComponent {
  bookInput = input.required<BookUi>({ alias: 'book' });

  book = linkedSignal(() => this.bookInput());

  @Output() close = new EventEmitter<void>();
  @Output() bookDeleted = new EventEmitter<string>();

  private libraryService = inject(LibraryService);
  readonly store = inject(LibraryStore);
  readonly config = inject(ConfigStore);
  readonly electronApi = inject(ElectronService);

  readonly INFO = INFO_MESSAGES;


  @ViewChild('genresContent') genresContent!: ElementRef;
  @ViewChild('tropesContent') tropesContent!: ElementRef;

  currentView = signal<'details' | 'settings'>('details');
  activeSlideModalAnimation = signal<boolean>(false);

  // Settings State
  selectedTense = signal<'past' | 'present'>('past');
  selectedLanguage = signal<string>('english');
  selectedPOV = signal<'first' | 'third-limited' | 'third-omni' | 'second'>('third-limited');
  povCharacter = signal<string>('');
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
    { value: 'third-limited', label: 'Third Person Limited' },
    { value: 'third-omni', label: 'Third Person Omniscient' }
  ];

  availableGenres = ['Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Horror', 'Thriller', 'Historical', 'LitRPG', 'Wuxia', 'Xianxia'];
  availableSubgenres = ['Cyberpunk', 'Steampunk', 'Dark Fantasy', 'Urban Fantasy', 'Post-Apocalyptic', 'High Fantasy'];
  availableTropes = ['Enemies to Lovers', 'Chosen One', 'System', 'Reincarnation', 'Time Loop', 'Magic School'];

  genreOptions: DropdownOption[] = [
    { value: 'Fantasy', label: 'Fantasy', subOptions: [
      { value: 'High Fantasy', label: 'High Fantasy' },
      { value: 'Dark Fantasy', label: 'Dark Fantasy' },
      { value: 'Urban Fantasy', label: 'Urban Fantasy' }
    ]},
    { value: 'Sci-Fi', label: 'Sci-Fi', subOptions: [
      { value: 'Cyberpunk', label: 'Cyberpunk' },
      { value: 'Steampunk', label: 'Steampunk' },
      { value: 'Post-Apocalyptic', label: 'Post-Apocalyptic' }
    ]},
    { value: 'Romance', label: 'Romance' },
    { value: 'Mystery', label: 'Mystery' },
    { value: 'Horror', label: 'Horror' },
    { value: 'Thriller', label: 'Thriller' },
    { value: 'Historical', label: 'Historical' },
    { value: 'LitRPG', label: 'LitRPG' },
    { value: 'Wuxia', label: 'Wuxia' },
    { value: 'Xianxia', label: 'Xianxia' }
  ];
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
    this.animateCount(1000);
    this.config.loadLanguages();
    // Initialize settings from book data if available
    const book = this.book();
    if (book.language) this.selectedLanguage.set(book.language);
    this.useSynopsisInAiContext.set(book.synopsis !== '' ? true : false);
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

  private animateCount(duration: number) {
    const startTime = performance.now();
    const targetWords = this.book().wordCount || 0;
    const targetChapters = 0; // Placeholder until chapters are in schema

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
    const words = this.book().wordCount || 0;
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

  onSelectionChange(type: 'tense' | 'language' | 'pov', value: any) {
    if (type === 'tense') this.selectedTense.set(value);
    else if (type === 'language') this.selectedLanguage.set(value);
    else if (type === 'pov') this.selectedPOV.set(value);
  }

  onCharacterChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.povCharacter.set(value);
  }

  toggleAiContext() {
    this.useSynopsisInAiContext.set(!this.useSynopsisInAiContext());
  }

  onArchive() {
    console.log('Archive book:', this.book().id);
  }

  onDelete() {
    this.bookDeleted.emit(this.book().id);
  }

  onClose() {
    this.close.emit();
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
      
      const newCategories: CategoryDto[] = newNames.map(name => ({
        id: crypto.randomUUID(),
        name,
        type: isGenres ? 'genre' : 'trope',
        isCustom: isGenres 
          ? (!this.availableGenres.includes(name) && !this.availableSubgenres.includes(name)) 
          : (!this.availableTropes.includes(name))
      }));
      
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


}
