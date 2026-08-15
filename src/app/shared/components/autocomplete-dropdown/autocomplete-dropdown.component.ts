import {
  CDK_MENU,
  CdkMenuItem,
  CdkMenuModule,
  CdkMenuTrigger,
  MENU_TRIGGER,
  PARENT_OR_NEW_MENU_STACK_PROVIDER,
} from '@angular/cdk/menu';
import { CommonModule, DOCUMENT } from '@angular/common';
import {
  Component,
  ContentChild,
  Directive,
  ElementRef,
  effect,
  HostBinding,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import { Subscription } from 'rxjs';

/** Visual treatment used for the button that opens the dropdown. */
export type DropdownTriggerVariant = 'field' | 'add' | 'icon';

/** Position of multi-select chips relative to the dropdown trigger. */
export type DropdownChipsPosition = 'before' | 'after';

/** Semantic emphasis applied to a section message. */
export type DropdownMessageTone = 'muted' | 'error';

/** Supplementary copy rendered below the options in a dropdown section. */
export interface DropdownSectionMessage {
  text: string;
  tone?: DropdownMessageTone;
}

/**
 * A titled collection of sections rendered as one menu panel.
 *
 * Menus can be nested through {@link DropdownOption.submenu}. Root menus are
 * normally derived from `sections` or `options`; this type is also used for
 * each flyout submenu.
 *
 * @typeParam T Value type emitted when an option is selected.
 */
export interface DropdownMenu<T = any> {
  title?: string;
  sections: readonly DropdownSection<T>[];
}

/**
 * A logical grouping of options in a {@link DropdownMenu}.
 *
 * @typeParam T Value type associated with the section's options.
 */
export interface DropdownSection<T = any> {
  key: string;
  title?: string;
  dividerBefore?: boolean;
  options: readonly DropdownOption<T>[];
  message?: DropdownSectionMessage;
}

/**
 * A selectable row, aggregate action, or non-selectable submenu parent.
 *
 * `subOptions` is retained for inline, expandable legacy chips. Prefer
 * `submenu` for accessible recursive flyout menus.
 *
 * @typeParam T Value type emitted by the dropdown.
 */
export interface DropdownOption<T = any> {
  value: T;
  label: string;
  /** Legacy inline child chips. Flyout menus use `submenu`. */
  subOptions?: readonly DropdownOption<T>[];
  fontFamily?: string;
  group?: string;
  hint?: string;
  searchTerms?: readonly string[];
  count?: number;
  disabled?: boolean;
  selectable?: boolean;
  /** Values toggled as a unit by an aggregate option. */
  selectionValues?: readonly T[];
  submenu?: DropdownMenu<T>;
}

/** Internal flattened representation of a search match. */
interface DropdownSearchResult<T = any> {
  option: DropdownOption<T>;
  path: string;
}

/** Internal view model for one removable multi-select chip. */
interface DropdownChip<T = any> {
  key: string;
  label: string;
  values: readonly T[];
}

/** Internal selection state used by checkbox styling and ARIA attributes. */
interface DropdownSelectionState {
  checked: boolean;
  indeterminate: boolean;
}

/**
 * Marks projected content as the custom trigger for an autocomplete dropdown.
 *
 * The template's implicit context is the current open state, so it can render
 * a stateful trigger while the component retains button semantics and menu
 * wiring.
 */
@Directive({
  selector: 'ng-template[autocompleteDropdownTrigger]',
  standalone: true,
})
export class AutocompleteDropdownTriggerDirective {
  constructor(readonly templateRef: TemplateRef<{ $implicit: boolean }>) {}
}

/**
 * CDK menu item for multi-select rows that must not close its menu on activation.
 *
 * It retains CDK keyboard semantics while forcing the `keepOpen` trigger
 * option for click and space-bar activation.
 */
@Directive({
  selector: '[autocompleteKeepOpenMenuItem]',
  standalone: true,
  host: { role: 'menuitemcheckbox' },
  providers: [{
    provide: CdkMenuItem,
    useExisting: forwardRef(() => AutocompleteKeepOpenMenuItemDirective),
  }],
})
export class AutocompleteKeepOpenMenuItemDirective extends CdkMenuItem {
  override closeOnSpacebarTrigger = false;

  override trigger(options?: { keepOpen?: boolean }): void {
    super.trigger({ ...options, keepOpen: true });
  }
}

/**
 * A hover-only CDK submenu trigger.
 *
 * Clicking this directive never toggles the flyout. Hover opens it, and only
 * one sibling trigger in the same parent menu remains open at a time.
 */
@Directive({
  selector: '[autocompleteHoverMenuTriggerFor]',
  standalone: true,
  exportAs: 'autocompleteHoverMenuTriggerFor',
  host: { '(mouseenter)': 'openOnHover()' },
  providers: [{
    provide: MENU_TRIGGER,
    useExisting: forwardRef(() => AutocompleteHoverMenuTriggerDirective),
  }, PARENT_OR_NEW_MENU_STACK_PROVIDER],
})
export class AutocompleteHoverMenuTriggerDirective extends CdkMenuTrigger {
  private static readonly submenuGap = 8;
  private static readonly openTriggers = new WeakMap<object, AutocompleteHoverMenuTriggerDirective>();
  private static readonly openTriggersByDepth = new WeakMap<
    object,
    Map<number, AutocompleteHoverMenuTriggerDirective>
  >();
  private readonly parentMenu = inject(CDK_MENU, { optional: true });
  private readonly triggerElement = inject(ElementRef<HTMLElement>);
  private readonly document = inject(DOCUMENT);
  private registeredOwner?: object;
  private registeredDepth?: number;

  readonly hoverMenuTemplateRef = input<TemplateRef<unknown> | null>(null, {
    alias: 'autocompleteHoverMenuTriggerFor',
  });
  readonly hoverMenuOwner = input<object | null>(null, { alias: 'autocompleteHoverMenuOwner' });
  readonly hoverMenuDepth = input(0, { alias: 'autocompleteHoverMenuDepth' });
  private readonly syncMenuTemplateRef = effect(() => {
    this.menuTemplateRef = this.hoverMenuTemplateRef();
  });

  /** Opens the submenu, or prunes deeper descendants when its row is hovered again. */
  openOnHover(): void {
    if (!this.menuTemplateRef) return;

    if (this.isOpen()) {
      const owner = this.hoverMenuOwner() ?? this.menuStack;
      const triggersByDepth = AutocompleteHoverMenuTriggerDirective.openTriggersByDepth.get(
        owner,
      );
      if (triggersByDepth) {
        const currentDepth = this.hoverMenuDepth();
        const descendantDepths = [...triggersByDepth.keys()]
          .filter(depth => depth > currentDepth)
          .sort((a, b) => b - a);
        for (const depth of descendantDepths) {
          triggersByDepth.get(depth)?.close();
          triggersByDepth.delete(depth);
        }
      }
      return;
    }

    if (this.parentMenu) {
      const openTrigger = AutocompleteHoverMenuTriggerDirective.openTriggers.get(this.parentMenu);
      if (openTrigger !== this) openTrigger?.close();
      AutocompleteHoverMenuTriggerDirective.openTriggers.set(this.parentMenu, this);
    }

    this.registeredOwner = this.hoverMenuOwner() ?? this.menuStack;
    this.registeredDepth = this.hoverMenuDepth();
    let triggersByDepth = AutocompleteHoverMenuTriggerDirective.openTriggersByDepth.get(
      this.registeredOwner,
    );
    if (!triggersByDepth) {
      triggersByDepth = new Map();
      AutocompleteHoverMenuTriggerDirective.openTriggersByDepth.set(this.registeredOwner, triggersByDepth);
    }
    triggersByDepth.set(this.registeredDepth, this);
    this.updateMenuPositions();
    this.open();
  }

  /**
   * Keeps the normal flyout beside its row, but moves an opposite-side
   * fallback to the nearest outside corner of its parent panel.
   */
  private updateMenuPositions(): void {
    if (!this.parentMenu) return;

    const parentRect = this.parentMenu.nativeElement.getBoundingClientRect();
    const triggerRect = this.triggerElement.nativeElement.getBoundingClientRect();
    const isRtl = this.document.defaultView
      ?.getComputedStyle(this.parentMenu.nativeElement).direction === 'rtl';
    const normalOffsetX = isRtl
      ? -AutocompleteHoverMenuTriggerDirective.submenuGap
      : AutocompleteHoverMenuTriggerDirective.submenuGap;
    const parentStart = isRtl ? parentRect.right : parentRect.left;
    const triggerStart = isRtl ? triggerRect.right : triggerRect.left;
    const cornerOffsetX = parentStart - triggerStart;

    this.menuPosition = [
      {
        originX: 'end',
        originY: 'top',
        overlayX: 'start',
        overlayY: 'top',
        offsetX: normalOffsetX,
      },
      {
        originX: 'end',
        originY: 'bottom',
        overlayX: 'start',
        overlayY: 'bottom',
        offsetX: normalOffsetX,
      },
      {
        originX: 'start',
        originY: 'bottom',
        overlayX: 'end',
        overlayY: 'top',
        offsetX: cornerOffsetX,
        offsetY: parentRect.bottom - triggerRect.bottom,
      },
      {
        originX: 'start',
        originY: 'top',
        overlayX: 'end',
        overlayY: 'bottom',
        offsetX: cornerOffsetX,
        offsetY: parentRect.top - triggerRect.top,
      },
    ] satisfies ConnectedPosition[];
  }

  override _handleClick(): void {}

  override ngOnDestroy(): void {
    if (
      this.parentMenu &&
      AutocompleteHoverMenuTriggerDirective.openTriggers.get(this.parentMenu) === this
    ) {
      AutocompleteHoverMenuTriggerDirective.openTriggers.delete(this.parentMenu);
    }
    if (this.registeredOwner && this.registeredDepth !== undefined) {
      const triggersByDepth = AutocompleteHoverMenuTriggerDirective.openTriggersByDepth.get(
        this.registeredOwner,
      );
      if (triggersByDepth?.get(this.registeredDepth) === this) {
        triggersByDepth.delete(this.registeredDepth);
      }
    }
    super.ngOnDestroy();
  }
}

@Component({
  selector: 'app-autocomplete-dropdown',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CdkMenuModule,
    AutocompleteKeepOpenMenuItemDirective,
    AutocompleteHoverMenuTriggerDirective,
  ],
  templateUrl: './autocomplete-dropdown.component.html',
  styleUrl: './autocomplete-dropdown.component.scss',
})
/**
 * Searchable, accessible dropdown supporting single selection, multi-selection,
 * custom values, chips, grouped flat options, and recursive hover submenus.
 *
 * This is a controlled component: it never mutates `selectedValue`. Consumers
 * must update that input in response to {@link selectionChange} for the visual
 * selection, checkboxes, and chips to stay in sync.
 */
export class AutocompleteDropdownComponent implements OnInit, OnChanges, OnDestroy {
  readonly submenuHoverOwner = {};
  readonly placeholder = input('Select...');
  readonly options = input<readonly DropdownOption[]>([]);
  readonly sections = input<readonly DropdownSection[]>([]);
  readonly selectedValue = input<any | readonly any[]>(null);
  readonly multi = input(false);
  readonly allowCustom = input(false);
  readonly grouped = input(false);
  readonly showChips = input(true);
  readonly showSearchBar = input(true);
  readonly customAddPlaceholder = input('Add custom...');
  readonly searchPlaceholder = input('Search...');
  readonly emptyText = input('No options found');
  readonly customDropdownClass = input('');
  readonly triggerVariant = input<DropdownTriggerVariant>('field');
  readonly triggerAriaLabel = input<string | null>(null);
  readonly chipsPosition = input<DropdownChipsPosition>('after');
  readonly compactSelectionChips = input(false);
  readonly clearSearchOnSelect = input(true);
  readonly closeOnOutsideScroll = input(true);
  readonly keepParentMenuOpen = input(false);

  readonly selectionChange = output<any | any[]>();
  readonly menuOpened = output<void>();
  readonly menuClosed = output<void>();

  @ContentChild(AutocompleteDropdownTriggerDirective)
  customTrigger?: AutocompleteDropdownTriggerDirective;

  @ViewChild('searchInput') searchInputEl?: ElementRef<HTMLInputElement>;
  @ViewChild(CdkMenuTrigger) menuTrigger?: CdkMenuTrigger;

  @HostBinding('class.autocomplete-trigger-icon')
  get iconTriggerHost(): boolean {
    return this.triggerVariant() === 'icon';
  }

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly expandedOptions = signal<Set<any>>(new Set());
  readonly isOpen = signal(false);
  readonly searchResults = signal<readonly DropdownSearchResult[]>([]);

  private readonly document = inject(DOCUMENT);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private searchSubscription?: Subscription;
  private isClosing = false;

  private readonly documentClickListener = (event: Event): void => {
    const target = event.target as Element | null;
    if (!target || this.hostElement.nativeElement.contains(target)) return;
    if (target.closest('.autocomplete-dropdown')) return;
    this.closeMenu();
  };

  private readonly scrollListener = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('.autocomplete-dropdown')) return;
    this.menuTrigger?.close();
  };

  /** Starts search-result updates when the reactive search value changes. */
  ngOnInit(): void {
    this.searchSubscription = this.searchControl.valueChanges.subscribe(() => this.updateSearchResults());
    this.updateSearchResults();
  }

  /** Rebuilds derived search results whenever their option source changes. */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options'] || changes['sections']) this.updateSearchResults();
  }

  /** Releases the search subscription and document-level overlay listeners. */
  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    this.removeDocumentListeners();
  }

  /**
   * Resolves the root menu from explicit sections or the flat option input.
   *
   * Explicit `sections` win. When grouping flat options, each option's `group`
   * is used, falling back to the first uppercase label character.
   */
  rootMenu(): DropdownMenu {
    if (this.sections().length > 0) return { sections: this.sections() };
    if (!this.grouped()) return { sections: [{ key: 'options', options: this.options() }] };

    const groupedOptions = new Map<string, DropdownOption[]>();
    for (const option of this.options()) {
      const group = option.group || option.label.charAt(0).toUpperCase();
      const current = groupedOptions.get(group) ?? [];
      current.push(option);
      groupedOptions.set(group, current);
    }

    return {
      sections: [...groupedOptions.entries()].map(([title, options], index) => ({
        key: `group-${index}-${title}`,
        title,
        options,
      })),
    };
  }

  /**
   * Returns the menu to render, replacing only the root menu with flattened
   * search results while a non-empty query is active.
   */
  displayedMenu(menu: DropdownMenu, isRoot: boolean): DropdownMenu {
    if (!isRoot || !this.normalizedSearch()) return menu;
    return {
      sections: [{
        key: 'search-results',
        title: 'Search Results',
        options: this.searchResults().map(result => ({
          ...result.option,
          hint: result.path,
          subOptions: undefined,
          submenu: undefined,
        })),
      }],
    };
  }

  /** Marks the menu open, installs dismissal listeners, emits, then focuses search. */
  onMenuOpened(): void {
    this.isOpen.set(true);
    this.document.addEventListener('click', this.documentClickListener, true);
    if (this.closeOnOutsideScroll()) {
      this.document.addEventListener('scroll', this.scrollListener, true);
    }
    this.menuOpened.emit();
    setTimeout(() => this.searchInputEl?.nativeElement.focus());
  }

  /** Resets open and closing state, clears search, removes listeners, and emits. */
  onMenuClosed(): void {
    this.isOpen.set(false);
    this.isClosing = false;
    this.searchControl.setValue('');
    this.removeDocumentListeners();
    this.menuClosed.emit();
  }

  /** Closes the root CDK menu, which also closes its submenu tree. */
  closeMenu(): void {
    this.menuTrigger?.close();
  }

  /** Suppresses an immediately-following trigger click while a single-select close is pending. */
  onTriggerClick(event: MouseEvent): void {
    if (!this.isClosing) return;
    event.stopPropagation();
    event.preventDefault();
  }

  /** Clears search without dismissing the overlay and returns focus to its input. */
  clearSearch(event: MouseEvent): void {
    event.stopPropagation();
    this.searchControl.setValue('');
    this.searchInputEl?.nativeElement.focus();
  }

  /**
   * Selects or toggles an option.
   *
   * Aggregate options toggle all `selectionValues` together. Multi-select emits
   * a new array and remains open; single-select emits one value and closes.
   */
  selectOption(option: DropdownOption): void {
    if (option.disabled || option.selectable === false) return;

    if (this.multi()) {
      const values = this.valuesForOption(option);
      const selectedValue = this.selectedValue();
      const current = new Set(Array.isArray(selectedValue) ? selectedValue : []);
      const remove = values.length > 0 && values.every(value => current.has(value));

      for (const value of values) {
        if (remove) current.delete(value);
        else current.add(value);
      }

      this.selectionChange.emit([...current]);
      if (this.clearSearchOnSelect()) this.searchControl.setValue('');
      return;
    }

    this.selectionChange.emit(option.value);
    this.isClosing = true;
    this.closeMenu();
  }

  /** Removes every value represented by a multi-select chip without opening the menu. */
  removeChip(chip: DropdownChip, event: Event): void {
    event.stopPropagation();
    const removed = new Set(chip.values);
    const selectedValue = this.selectedValue();
    const current = Array.isArray(selectedValue) ? selectedValue : [];
    this.selectionChange.emit(current.filter(value => !removed.has(value)));
  }

  /** Adds the trimmed search value on Enter when custom values are enabled. */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !this.allowCustom()) return;
    const value = this.searchControl.value.trim();
    if (!value) return;
    event.preventDefault();
    this.addCustomValue(value);
  }

  /**
   * Emits a custom value, avoiding case-insensitive duplicate strings in
   * multi-select mode; single-select custom values close the menu.
   */
  addCustomValue(value: string): void {
    if (this.multi()) {
      const selectedValue = this.selectedValue();
      const currentValues = Array.isArray(selectedValue) ? [...selectedValue] : [];
      const exists = currentValues.some(current =>
        typeof current === 'string' && current.toLocaleLowerCase() === value.toLocaleLowerCase(),
      );
      if (!exists) this.selectionChange.emit([...currentValues, value]);
      this.searchControl.setValue('');
      return;
    }

    this.selectionChange.emit(value);
    this.searchControl.setValue('');
    this.isClosing = true;
    this.closeMenu();
  }

  /** Returns the field trigger label, or the placeholder for other trigger modes. */
  getDisplayLabel(): string {
    if (this.multi() || this.triggerVariant() !== 'field') return this.placeholder();
    return this.findOptionByValue(this.rootMenu(), this.selectedValue())?.label ?? this.placeholder();
  }

  /** Returns the selected single option's requested font family, if any. */
  getSelectedFontFamily(): string | undefined {
    if (this.multi()) return undefined;
    return this.findOptionByValue(this.rootMenu(), this.selectedValue())?.fontFamily;
  }

  /** Whether the field trigger currently displays placeholder-styled text. */
  isPlaceholder(): boolean {
    if (this.multi() || this.triggerVariant() !== 'field') return true;
    return !this.findOptionByValue(this.rootMenu(), this.selectedValue());
  }

  /** Toggles visibility of legacy inline `subOptions` for a parent option. */
  toggleExpand(value: any): void {
    this.expandedOptions.update(current => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  /** Tests whether an option's legacy inline child chips are expanded. */
  isExpanded(value: any): boolean {
    return this.expandedOptions().has(value);
  }

  /**
   * Calculates checked and indeterminate state for an option.
   * Aggregate options are checked only when all represented values are selected.
   */
  selectionState(option: DropdownOption): DropdownSelectionState {
    const selectedValue = this.selectedValue();
    const selected = new Set(Array.isArray(selectedValue) ? selectedValue : [selectedValue]);
    const values = this.valuesForOption(option);
    const selectedCount = values.reduce((count, value) => count + Number(selected.has(value)), 0);

    return {
      checked: values.length > 0 && selectedCount === values.length,
      indeterminate: this.multi() && selectedCount > 0 && selectedCount < values.length,
    };
  }

  /** Converts an option's selection state to its `aria-checked` value. */
  ariaChecked(option: DropdownOption): 'true' | 'false' | 'mixed' {
    const state = this.selectionState(option);
    return state.indeterminate ? 'mixed' : state.checked ? 'true' : 'false';
  }

  /**
   * Builds removable chips for selected multi-values, including values that do
   * not map to an option (such as custom values).
   */
  selectedChips(): readonly DropdownChip[] {
    if (!this.multi()) return [];

    const selectedValue = this.selectedValue();
    const selected = new Set(Array.isArray(selectedValue) ? selectedValue : []);
    const represented = new Set<any>();
    const chips: DropdownChip[] = [];

    const visitOption = (option: DropdownOption): void => {
      if (option.disabled || option.selectable === false) {
        this.visitOptionChildren(option, visitOption);
        return;
      }

      const aggregate = option.selectionValues ? [...option.selectionValues] : [];
      if (this.compactSelectionChips() && aggregate.length > 0 && aggregate.every(value => selected.has(value))) {
        chips.push({
          key: `aggregate:${String(option.value)}`,
          label: option.label,
          values: aggregate,
        });
        aggregate.forEach(value => represented.add(value));
        return;
      }

      if (!option.selectionValues && selected.has(option.value)) {
        chips.push({
          key: `value:${String(option.value)}`,
          label: option.label,
          values: [option.value],
        });
        represented.add(option.value);
      }

      this.visitOptionChildren(option, visitOption);
    };

    for (const section of this.rootMenu().sections) section.options.forEach(visitOption);

    for (const value of selected) {
      if (represented.has(value)) continue;
      chips.push({ key: `custom:${String(value)}`, label: String(value), values: [value] });
    }

    return chips;
  }

  /** Returns whether any section of a menu contains at least one option. */
  hasOptions(menu: DropdownMenu): boolean {
    return menu.sections.some(section => section.options.length > 0);
  }

  /** Angular tracking function; option values must be unique among rendered siblings. */
  trackOption(_index: number, option: DropdownOption): any {
    return option.value;
  }

  /** Recomputes flattened search results from the current normalized search term. */
  private updateSearchResults(): void {
    const term = this.normalizedSearch();
    if (!term) {
      this.searchResults.set([]);
      return;
    }

    const results: DropdownSearchResult[] = [];
    this.collectSearchResults(this.rootMenu(), term, [], results);
    this.searchResults.set(results);
  }

  /**
   * Recursively collects enabled, selectable options whose label or explicit
   * search terms contain `term`, preserving their visible ancestry.
   */
  private collectSearchResults(
    menu: DropdownMenu,
    term: string,
    ancestors: readonly string[],
    results: DropdownSearchResult[],
  ): void {
    const menuAncestors = menu.title ? this.appendDistinct(ancestors, menu.title) : [...ancestors];

    for (const section of menu.sections) {
      const sectionAncestors = section.title
        ? this.appendDistinct(menuAncestors, section.title)
        : [...menuAncestors];

      for (const option of section.options) {
        const terms = [option.label, ...(option.searchTerms ?? [])];
        if (
          option.selectable !== false &&
          !option.disabled &&
          terms.some(value => value.toLocaleLowerCase().includes(term))
        ) {
          results.push({ option, path: sectionAncestors.join(' / ') });
        }

        const childAncestors = this.appendDistinct(sectionAncestors, option.label);
        for (const subOption of option.subOptions ?? []) {
          const subTerms = [subOption.label, ...(subOption.searchTerms ?? [])];
          if (
            subOption.selectable !== false &&
            !subOption.disabled &&
            subTerms.some(value => value.toLocaleLowerCase().includes(term))
          ) {
            results.push({ option: subOption, path: childAncestors.join(' / ') });
          }
        }

        if (option.submenu) {
          this.collectSearchResults(option.submenu, term, childAncestors, results);
        }
      }
    }
  }

  /** Returns the trimmed, locale-aware lowercase query used for matching. */
  private normalizedSearch(): string {
    return this.searchControl.value.trim().toLocaleLowerCase();
  }

  /** Returns all values toggled by an option, or its own value for normal options. */
  private valuesForOption(option: DropdownOption): readonly any[] {
    return option.selectionValues ?? [option.value];
  }

  /** Searches a menu tree and legacy inline children for the first strict value match. */
  private findOptionByValue(menu: DropdownMenu, value: any): DropdownOption | undefined {
    for (const section of menu.sections) {
      for (const option of section.options) {
        if (option.value === value) return option;

        const legacyChild = option.subOptions?.find(child => child.value === value);
        if (legacyChild) return legacyChild;

        if (option.submenu) {
          const found = this.findOptionByValue(option.submenu, value);
          if (found) return found;
        }
      }
    }
    return undefined;
  }

  /** Visits direct legacy and flyout-menu descendants of an option. */
  private visitOptionChildren(option: DropdownOption, visitor: (option: DropdownOption) => void): void {
    option.subOptions?.forEach(visitor);
    option.submenu?.sections.forEach(section => section.options.forEach(visitor));
  }

  /** Returns a new path, omitting an adjacent duplicate label. */
  private appendDistinct(values: readonly string[], value: string): string[] {
    return values.at(-1) === value ? [...values] : [...values, value];
  }

  /** Removes temporary click and scroll listeners installed while the root menu is open. */
  private removeDocumentListeners(): void {
    this.document.removeEventListener('click', this.documentClickListener, true);
    this.document.removeEventListener('scroll', this.scrollListener, true);
  }
}
