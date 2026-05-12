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

@Component({
  selector: 'app-book-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CdkMenuModule, AutocompleteDropdownComponent],
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
    wordCount: [0]
  });

  genres = this.fb.array([]);
  subgenres = this.fb.array([]);
  tropes = this.fb.array([]);

  genreInput = new FormControl('');
  subgenreInput = new FormControl('');
  tropeInput = new FormControl('');
  languageInput = new FormControl('');

  availableGenres = ['Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Horror', 'Thriller', 'Historical', 'LitRPG', 'Wuxia', 'Xianxia'];
  availableSubgenres = ['Cyberpunk', 'Steampunk', 'Dark Fantasy', 'Urban Fantasy', 'Post-Apocalyptic', 'High Fantasy'];
  availableTropes = ['Enemies to Lovers', 'Chosen One', 'System', 'Reincarnation', 'Time Loop', 'Magic School'];

  genreOptions: DropdownOption[] = this.availableGenres.map(g => ({ value: g, label: g }));
  subgenreOptions: DropdownOption[] = this.availableSubgenres.map(g => ({ value: g, label: g }));
  tropeOptions: DropdownOption[] = this.availableTropes.map(g => ({ value: g, label: g }));

  isSubmitting = false;
  isDragging = false;

  coverPreview = signal<string | null>(null);

  languages: { value: string, label: string }[] = [];

  ngOnInit() {
    this.config.loadLanguages();
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
  onDrop($event: DragEvent) {
    $event.preventDefault();
    $event.stopPropagation();
    this.isDragging = false;

    const files = $event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  private handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {

      this.coverPreview.set(reader.result as string);

      this.bookForm.patchValue({
        coverImage: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
  }

  onFileChange(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.handleFile(file);
    }
    // Reset the input value so the same file can be selected again
    event.target.value = '';
  }

  removeCoverImage(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.coverPreview.set(null);
    this.bookForm.patchValue({ coverImage: null });
  }

  onSelectionChange(type: 'genre' | 'subgenre' | 'trope' | 'language', value: any) {
    if (type === 'language') {
      this.bookForm.patchValue({ language: value });
    } else {
      const arrayControl = type === 'genre' ? this.genres : (type === 'subgenre' ? this.subgenres : this.tropes);

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
          ...(this.genres.value as string[]).map((name: string) => ({
            id: crypto.randomUUID(),
            name,
            type: 'genre' as const,
            isCustom: !this.availableGenres.includes(name)
          })),
          ...(this.subgenres.value as string[]).map((name: string) => ({
            id: crypto.randomUUID(),
            name,
            type: 'genre' as const, // Mapped to genre for db compatibility
            isCustom: !this.availableSubgenres.includes(name)
          })),
          ...(this.tropes.value as string[]).map((name: string) => ({
            id: crypto.randomUUID(),
            name,
            type: 'trope' as const,
            isCustom: !this.availableTropes.includes(name)
          }))
        ];

        const bookData: CreateBookDto = {
          ...this.bookForm.value,
          categories
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
