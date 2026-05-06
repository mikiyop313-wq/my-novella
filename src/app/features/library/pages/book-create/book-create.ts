import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormArray, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { LibraryService } from "../../services/library.service"
import { CreateBookDto, CategoryDto } from '../../../../../../shared/models/book.model';
import { CdkMenuModule } from '@angular/cdk/menu';

@Component({
  selector: 'app-book-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CdkMenuModule],
  templateUrl: './book-create.html',
  styleUrl: './book-create.scss'
})
export class BookCreate implements OnInit {

  private fb = inject(FormBuilder);
  private libraryService = inject(LibraryService);
  private router = inject(Router);

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

  availableGenres = ['Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Horror', 'Thriller', 'Historical', 'LitRPG', 'Wuxia', 'Xianxia'];
  availableSubgenres = ['Cyberpunk', 'Steampunk', 'Dark Fantasy', 'Urban Fantasy', 'Post-Apocalyptic', 'High Fantasy'];
  availableTropes = ['Enemies to Lovers', 'Chosen One', 'System', 'Reincarnation', 'Time Loop', 'Magic School'];

  filteredGenres: string[] = [];
  filteredSubgenres: string[] = [];
  filteredTropes: string[] = [];

  isSubmitting = false;
  isDragging = false;

  coverPreview = signal<string | null>(null);

  languages = [
    { value: 'english', label: 'English' },
    { value: 'spanish', label: 'Spanish' },
    { value: 'french', label: 'French' },
    { value: 'german', label: 'German' },
    { value: 'japanese', label: 'Japanese' },
    { value: 'chinese', label: 'Chinese' },
    { value: 'korean', label: 'Korean' },
    { value: 'russian', label: 'Russian' },
    { value: 'other', label: 'Other' }
  ];

  ngOnInit() {
    this.filterOptions('genre', '');
    this.filterOptions('subgenre', '');
    this.filterOptions('trope', '');
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

  getControl(type: 'genre' | 'subgenre' | 'trope'): FormControl {
    if (type === 'genre') return this.genreInput;
    if (type === 'subgenre') return this.subgenreInput;
    return this.tropeInput;
  }

  onMenuOpened(type: 'genre' | 'subgenre' | 'trope') {
    this.filterOptions(type, this.getControl(type).value || '');
    setTimeout(() => {
      document.getElementById(`${type}Input`)?.focus();
    }, 0);
  }

  onInputChange(event: Event, type: 'genre' | 'subgenre' | 'trope') {
    const value = (event.target as HTMLInputElement).value;
    this.filterOptions(type, value);
  }

  filterOptions(type: 'genre' | 'subgenre' | 'trope', query: string) {
    const q = query.toLowerCase();
    if (type === 'genre') {
      const selected = this.genres.value as string[];
      this.filteredGenres = this.availableGenres.filter(g => !selected.includes(g) && g.toLowerCase().includes(q));
    } else if (type === 'subgenre') {
      const selected = this.subgenres.value as string[];
      this.filteredSubgenres = this.availableSubgenres.filter(g => !selected.includes(g) && g.toLowerCase().includes(q));
    } else {
      const selected = this.tropes.value as string[];
      this.filteredTropes = this.availableTropes.filter(g => !selected.includes(g) && g.toLowerCase().includes(q));
    }
  }

  selectPredefinedTag(type: 'genre' | 'subgenre' | 'trope', value: string) {
    this.getControl(type).setValue(value);
    this.addTag(type);
  }

  addTag(type: 'genre' | 'subgenre' | 'trope') {
    let inputControl = this.getControl(type);
    let arrayControl: FormArray;

    if (type === 'genre') arrayControl = this.genres;
    else if (type === 'subgenre') arrayControl = this.subgenres;
    else arrayControl = this.tropes;

    const value = inputControl.value?.trim();
    if (value) {
      const exists = arrayControl.controls.some(ctrl => ctrl.value.toLowerCase() === value.toLowerCase());
      if (!exists) {
        arrayControl.push(this.fb.control(value));
      }
      inputControl.setValue('');
      this.filterOptions(type, ''); // Refresh options
    }
  }

  removeTag(type: 'genre' | 'subgenre' | 'trope', index: number) {
    if (type === 'genre') this.genres.removeAt(index);
    else if (type === 'subgenre') this.subgenres.removeAt(index);
    else this.tropes.removeAt(index);
  }

  onKeyDown(event: KeyboardEvent, type: 'genre' | 'subgenre' | 'trope') {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addTag(type);
    }
  }

  async onSubmit() {
    if (this.bookForm.valid && !this.isSubmitting) {
      this.isSubmitting = true;
      try {
        const categories: CategoryDto[] = [
          ...(this.genres.value as string[]).map((name: string) => ({ id: crypto.randomUUID(), name, type: 'genre' as const })),
          ...(this.subgenres.value as string[]).map((name: string) => ({ id: crypto.randomUUID(), name, type: 'genre' as const })), // Mapped to genre for db compatibility
          ...(this.tropes.value as string[]).map((name: string) => ({ id: crypto.randomUUID(), name, type: 'trope' as const }))
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
