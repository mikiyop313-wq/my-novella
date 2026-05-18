import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ElementRef, ViewChild, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu';

export interface DropdownOption {
  value: any;
  label: string;
  subOptions?: DropdownOption[];
  fontFamily?: string;
  group?: string;
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

  // Track menu state
  isOpen = signal(false);

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
    this.isOpen.set(true);
    this.searchControl.setValue('');
    setTimeout(() => {
      this.searchInputEl?.nativeElement.focus();
    }, 0);
  }

  onMenuClosed() {
    this.isOpen.set(false);
    this.isClosing = false;
  }

  onTriggerClick(event: MouseEvent) {
    if (this.isClosing) {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  selectOption(option: DropdownOption) {
    if (!this.isSelected(option.value)) {

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
    else {
      this.removeOption(option);
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

  getSelectedFontFamily(): string | undefined {
    if (this.multi) return undefined;
    const found = this.findOptionByValue(this.options, this.selectedValue);
    return found ? found.fontFamily : undefined;
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
  /**
   * Determines whether a group header separator should be shown in the UI before
   * the option at the given index.
   * 
   * A header is displayed if:
   * 1. The list is grouped and this is the very first option in the list.
   * 2. The group key of the current option is different from the group key of the previous option.
   *
   * @param index The 0-based index of the current option in the filtered options list.
   * @returns `true` if a group header should be rendered before this option; otherwise `false`.
   */
  shouldShowGroupHeader(index: number): boolean {
    // If grouping is disabled, we never show headers.
    // If it's the very first item (index === 0), we show a header only if grouping is enabled.
    if (!this.grouped || index === 0) return this.grouped && index === 0;

    const currentGroup = this.getGroupHeader(index);

    // Show a header only if this group hasn't appeared yet in the list.
    const isGroupAlreadyShown = this.filteredOptions().some((_, i) => i < index && this.getGroupHeader(i) === currentGroup);

    return !isGroupAlreadyShown;
  }

  /**
   * Retrieves the header title/label for the group that contains the option at the specified index.
   *
   * @param index The 0-based index of the option in the filtered options list.
   * @returns The specified group name or the uppercase first character of the option's label.
   */
  getGroupHeader(index: number): string {
    const option = this.filteredOptions()[index];
    return option.group || option.label[0].toUpperCase();
  }
}
