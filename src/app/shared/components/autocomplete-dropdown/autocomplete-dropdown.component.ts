import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ElementRef, ViewChild, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CdkMenuModule } from '@angular/cdk/menu';

export interface DropdownOption {
  value: any;
  label: string;
}

@Component({
  selector: 'app-autocomplete-dropdown',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CdkMenuModule],
  templateUrl: './autocomplete-dropdown.component.html',
  styleUrl: './autocomplete-dropdown.component.scss'
})
export class AutocompleteDropdownComponent implements OnInit, OnChanges {
  @Input() placeholder: string = 'Select...';
  @Input() options: DropdownOption[] = [];
  @Input() selectedValue: any | any[] = null;
  @Input() multi: boolean = false;
  @Input() allowCustom: boolean = false;
  @Input() grouped: boolean = false;
  @Input() showChips: boolean = true;
  @Input() showSearchBar: boolean = true;
  @Input() customAddPlaceholder: string = 'Add custom...';

  @Output() selectionChange = new EventEmitter<any | any[]>();

  @ViewChild('searchInput') searchInputEl?: ElementRef<HTMLInputElement>;

  searchControl = new FormControl('');
  filteredOptions = signal<DropdownOption[]>([]);

  // For multi-select chips
  selectedOptions = signal<DropdownOption[]>([]);

  ngOnInit() {
    this.updateFilteredOptions();
    this.syncSelectedOptions();

    this.searchControl.valueChanges.subscribe(val => {
      this.updateFilteredOptions(val || '');
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['options'] || changes['selectedValue']) {
      this.updateFilteredOptions(this.searchControl.value || '');
      this.syncSelectedOptions();
    }
  }

  updateFilteredOptions(query: string = '') {
    const q = query.toLowerCase();
    let filtered = this.options;

    if (this.multi) {
      const selectedValues = Array.isArray(this.selectedValue) ? this.selectedValue : [];
      filtered = filtered.filter(opt => !selectedValues.includes(opt.value));
    }

    if (q) {
      filtered = filtered.filter(opt => opt.label.toLowerCase().includes(q));
    }

    this.filteredOptions.set(filtered);
  }

  syncSelectedOptions() {
    if (this.multi) {
      const selectedValues = Array.isArray(this.selectedValue) ? this.selectedValue : [];
      const fromOptions = this.options.filter(opt => selectedValues.includes(opt.value));

      // Handle custom values that are not in the options list
      const customValues = selectedValues.filter(val => !this.options.some(opt => opt.value === val));
      const customOptions = customValues.map(val => ({ value: val, label: val }));

      this.selectedOptions.set([...fromOptions, ...customOptions]);
    }
  }

  onMenuOpened() {
    this.searchControl.setValue('');
    setTimeout(() => {
      this.searchInputEl?.nativeElement.focus();
    }, 0);
  }

  selectOption(option: DropdownOption) {
    if (this.multi) {
      const currentValues = Array.isArray(this.selectedValue) ? [...this.selectedValue] : [];
      if (!currentValues.includes(option.value)) {
        currentValues.push(option.value);
        this.selectionChange.emit(currentValues);
      }
      this.searchControl.setValue('');
    } else {
      this.selectionChange.emit(option.value);
    }
  }

  removeOption(option: DropdownOption) {
    if (this.multi) {
      const currentValues = Array.isArray(this.selectedValue) ? this.selectedValue.filter(v => v !== option.value) : [];
      this.selectionChange.emit(currentValues);
    }
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && this.allowCustom) {
      const value = this.searchControl.value?.trim();
      if (value) {
        event.preventDefault();
        this.addCustomValue(value);
      }
    }
  }

  addCustomValue(value: string) {
    if (this.multi) {
      const currentValues = Array.isArray(this.selectedValue) ? [...this.selectedValue] : [];
      if (!currentValues.some(v => v.toLowerCase() === value.toLowerCase())) {
        currentValues.push(value);
        this.selectionChange.emit(currentValues);
      }
    } else {
      this.selectionChange.emit(value);
    }
    this.searchControl.setValue('');
  }

  getDisplayLabel(): string {
    if (this.multi) return this.placeholder;
    const found = this.options.find(opt => opt.value === this.selectedValue);
    return found ? found.label : this.placeholder;
  }

  isPlaceholder(): boolean {
    if (this.multi) return true;
    return !this.options.some(opt => opt.value === this.selectedValue);
  }

  // Grouping logic for template
  shouldShowGroupHeader(index: number): boolean {
    if (!this.grouped || index === 0) return this.grouped && index === 0;
    const current = this.filteredOptions()[index].label[0].toUpperCase();
    const prev = this.filteredOptions()[index - 1].label[0].toUpperCase();
    return current !== prev;
  }

  getGroupHeader(index: number): string {
    return this.filteredOptions()[index].label[0].toUpperCase();
  }
}
