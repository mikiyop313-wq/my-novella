import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormArray, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { LibraryService } from "../../services/library.service"
import { LibraryStore } from '../../store/book.store';
import { ConfigStore } from '../../../../core/store/config.store';
import { CreateBookDto, CategoryDto } from '../../../../../../shared/models/book.model';
import { CdkMenuModule } from '@angular/cdk/menu';
import { AutocompleteDropdownComponent, DropdownOption } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { ImageCropModalComponent } from '../../../../shared/components/image-crop-modal/image-crop-modal.component';
import {
  COVER_CROP_CONFIG,
  fileToDataUrl,
  loadImageDimensions,
  matchesCoverAspectRatio,
} from '../../../../shared/utils/cover-image';

@Component({
  selector: 'app-book-create',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CdkMenuModule,
    AutocompleteDropdownComponent,
    ImageCropModalComponent,
  ],
  templateUrl: './book-create.html',
  styleUrl: './book-create.scss'
})
export class BookCreate implements OnInit {

  private fb = inject(FormBuilder);
  private libraryService = inject(LibraryService);
  private router = inject(Router);
  readonly store = inject(LibraryStore);
  readonly config = inject(ConfigStore);

  bookForm: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(1)]],
    author: ['', [Validators.required]],
    synopsis: [''],
    language: ['english', [Validators.required]],
    coverImage: [null],
    status: ['draft'],
    wordCount: [0],
    proseTense: ['past'],
    pointOfView: ['third_limited'],
    povCharacterId: [null]
  });

  genres = this.fb.array([]);
  tropes = this.fb.array([]);

  genreInput = new FormControl('');
  tropeInput = new FormControl('');
  languageInput = new FormControl('');

  isSubmitting = false;
  isDragging = false;
  isAdvancedSettingsOpen = signal(false);

  coverPreview = signal<string | null>(null);
  pendingCoverFile = signal<File | null>(null);
  readonly coverCropConfig = COVER_CROP_CONFIG;

  languages: { value: string, label: string }[] = [];

  tenses: DropdownOption[] = [
    { value: 'past', label: 'Past Tense' },
    { value: 'present', label: 'Present Tense' }
  ];

  povs: DropdownOption[] = [
    { value: 'first', label: 'First Person' },
    { value: 'second', label: 'Second Person' },
    { value: 'third_limited', label: 'Third Person Limited' },
    { value: 'third_omniscient', label: 'Third Person Omniscient' }
  ];

  characters: DropdownOption[] = [];

  toggleAdvancedSettings() {
    this.isAdvancedSettingsOpen.update(v => !v);
  }

  ngOnInit() {
    this.config.loadLanguages();
    this.config.loadGenres();
    this.config.loadTropes();
  }



  onDragOver($event: DragEvent) {
    $event.preventDefault();
    $event.stopPropagation();
    this.isDragging = true;

  }
  onDragLeave($event: DragEvent) {
    $event.preventDefault();
    $event.stopPropagation();
    this.isDragging = false;

  }
  async onDrop($event: DragEvent): Promise<void> {
    $event.preventDefault();
    $event.stopPropagation();
    this.isDragging = false;

    const files = $event.dataTransfer?.files;
    if (files && files.length > 0) {
      await this.handleFile(files[0]);
    }
  }

  private async handleFile(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) return;

    try {
      const dimensions = await loadImageDimensions(file);
      if (matchesCoverAspectRatio(dimensions)) {
        await this.setCoverFile(file);
        return;
      }

      this.pendingCoverFile.set(file);
    } catch (error) {
      console.error('Failed to load cover image:', error);
    }
  }

  async onFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await this.handleFile(file);
    }
    input.value = '';
  }

  async onCoverCropped(file: File): Promise<void> {
    this.pendingCoverFile.set(null);
    await this.setCoverFile(file);
  }

  cancelCoverCrop(): void {
    this.pendingCoverFile.set(null);
  }

  private async setCoverFile(file: File): Promise<void> {
    try {
      const dataUrl = await fileToDataUrl(file);
      this.coverPreview.set(dataUrl);
      this.bookForm.patchValue({ coverImage: dataUrl });
    } catch (error) {
      console.error('Failed to read cover image:', error);
    }
  }

  removeCoverImage(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.coverPreview.set(null);
    this.bookForm.patchValue({ coverImage: null });
  }

  onSelectionChange(type: 'genre' | 'trope' | 'language' | 'tense' | 'pov' | 'povCharacter', value: any) {
    if (type === 'language') {
      this.bookForm.patchValue({ language: value });
    } else if (type === 'tense') {
      this.bookForm.patchValue({ proseTense: value });
    } else if (type === 'pov') {
      this.bookForm.patchValue({ pointOfView: value });
    } else if (type === 'povCharacter') {
      this.bookForm.patchValue({ povCharacterId: value });
    } else {
      const arrayControl = type === 'genre' ? this.genres : this.tropes;

      // Sync form array with selected values
      arrayControl.clear();
      (value as string[]).forEach(val => {
        arrayControl.push(this.fb.control(val));
      });
    }
  }

  async onSubmit() {
    if (this.bookForm.valid && !this.isSubmitting) {
      this.isSubmitting = true;
      try {
        const categories: CategoryDto[] = [
          ...(this.genres.value as string[]).map((name: string) => {
            const allGenres = this.config.genres();
            const existsAsGenre = allGenres.some(g => g.value === name);
            const existsAsSubgenre = allGenres.some(g => g.subOptions?.some(s => s.value === name));
            return {
              id: crypto.randomUUID(),
              name,
              type: 'genre' as const,
              isCustom: !existsAsGenre && !existsAsSubgenre
            };
          }),
          ...(this.tropes.value as string[]).map((name: string) => {
            const allTropes = this.config.tropes();
            const existsAsTrope = allTropes.some(t => t.value === name);
            const existsAsSubtrope = allTropes.some(t => t.subOptions?.some(s => s.value === name));
            return {
              id: crypto.randomUUID(),
              name,
              type: 'trope' as const,
              isCustom: !existsAsTrope && !existsAsSubtrope
            };
          })
        ];

        const formValue = this.bookForm.value;
        const bookData: CreateBookDto = {
          title: formValue.title,
          author: formValue.author,
          synopsis: formValue.synopsis,
          language: formValue.language,
          coverImage: formValue.coverImage,
          status: formValue.status,
          wordCount: formValue.wordCount,
          categories,
          settings: {
            language: formValue.language,
            proseTense: formValue.proseTense,
            pointOfView: formValue.pointOfView,
            povCharacterId: formValue.povCharacterId,
            synopsisAiContext: true
          }
        };

        await this.libraryService.addNewBook(bookData);
        this.router.navigate(['/library']);
      } catch (error) {
        console.error('Failed to create book:', error);
      } finally {
        this.isSubmitting = false;
      }
    }
  }

  cancel() {
    this.router.navigate(['/library']);
  }
}
