import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ElementRef, ViewChild, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu';

export interface DropdownOption {
  value: any;
  label: string;
  subOptions?: DropdownOption[];
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
  @ViewChild(CdkMenuTrigger) menuTrigger?: CdkMenuTrigger;

  searchControl = new FormControl('');
  filteredOptions = signal<DropdownOption[]>([]);

  // For multi-select chips
  selectedOptions = signal<DropdownOption[]>([]);

  // Track expanded items
  expandedOptions = signal<Set<any>>(new Set());

  private isClosing = false;

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
    let filtered: DropdownOption[] = [];

    // Deep copy options if we are filtering so we don't mutate the original options array
    if (q) {
      this.options.forEach(opt => {
        const matchesLabel = opt.label.toLowerCase().includes(q);
        const matchedSubOptions = opt.subOptions?.filter(sub => sub.label.toLowerCase().includes(q)) || [];

        if (matchesLabel || matchedSubOptions.length > 0) {
          filtered.push({
            ...opt,
            subOptions: matchedSubOptions.length > 0 ? matchedSubOptions : opt.subOptions
          });
          // Auto-expand if search matched subOptions
          if (matchedSubOptions.length > 0) {
            this.expandedOptions.update(set => {
              const newSet = new Set(set);
              newSet.add(opt.value);
              return newSet;
            });
          }
        }
      });
    } else {
      filtered = [...this.options];
    }

    this.filteredOptions.set(filtered);
  }

  syncSelectedOptions() {
    if (this.multi) {
      const selectedValues = Array.isArray(this.selectedValue) ? this.selectedValue : [];

      // Flatten all options to find labels for selected values
      const allOptions: DropdownOption[] = [];
      this.options.forEach(opt => {
        allOptions.push(opt);
        if (opt.subOptions) {
          allOptions.push(...opt.subOptions);
        }
      });

      const fromOptions = allOptions.filter(opt => selectedValues.includes(opt.value));

      // Handle custom values that are not in the options list
      const customValues = selectedValues.filter(val => !allOptions.some(opt => opt.value === val));
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

  onMenuClosed() {
    this.isClosing = false;
  }

  onTriggerClick(event: MouseEvent) {
    if (this.isClosing) {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  selectOption(option: DropdownOption) {

    if (this.multi) {
      // MULTI-SELECT MODE

      // Ensure selectedValue is an array and clone it
      const currentValues = Array.isArray(this.selectedValue)
        ? [...this.selectedValue]
        : [];

      // Only add the option if it's not already selected
      if (!currentValues.includes(option.value)) {
        currentValues.push(option.value);

        // Emit updated selection to parent/component listener
        this.selectionChange.emit(currentValues);
      }

      // Clear search input after selecting
      this.searchControl.setValue('');

    } else {
      // SINGLE-SELECT MODE

      // Emit the selected value directly
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
    const found = this.findOptionByValue(this.options, this.selectedValue);
    return found ? found.label : this.placeholder;
  }

  isPlaceholder(): boolean {
    if (this.multi) return true;
    return !this.findOptionByValue(this.options, this.selectedValue);
  }

  private findOptionByValue(options: DropdownOption[], value: any): DropdownOption | undefined {
    for (const opt of options) {
      if (opt.value === value) return opt;
      if (opt.subOptions) {
        const found = this.findOptionByValue(opt.subOptions, value);
        if (found) return found;
      }
    }
    return undefined;
  }

  toggleExpand(value: any) {
    this.expandedOptions.update(set => {
      const newSet = new Set(set);
      if (newSet.has(value)) {
        newSet.delete(value);
      } else {
        newSet.add(value);
      }
      return newSet;
    });
  }

  isExpanded(value: any): boolean {
    return this.expandedOptions().has(value);
  }

  isSelected(value: any): boolean {
    if (this.multi) {
      const selectedValues = Array.isArray(this.selectedValue) ? this.selectedValue : [];
      return selectedValues.includes(value);
    }
    return this.selectedValue === value;
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
