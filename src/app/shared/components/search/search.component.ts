import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
  ViewEncapsulation,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-search',
  standalone: true,
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class SearchComponent implements AfterViewInit {
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  readonly query = input('');
  readonly currentMatch = input(0);
  readonly totalMatches = input(0);
  readonly scopeSelected = input(false);
  readonly scopeLabel = input<string | null>(null);
  readonly matchCase = input(false);
  readonly wholeWord = input(false);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly regionLabel = input('Search');
  readonly inputLabel = input('Search content');
  readonly placeholder = input('Find');
  readonly compact = input(false);

  readonly queryChange = output<string>();
  readonly scopeSelectedChange = output<boolean>();
  readonly matchCaseChange = output<boolean>();
  readonly wholeWordChange = output<boolean>();
  readonly previous = output<void>();
  readonly next = output<void>();
  readonly closed = output<void>();
  readonly retry = output<void>();

  ngAfterViewInit(): void {
    this.focusInput();
  }

  focusInput({ select = true }: { select?: boolean } = {}): void {
    queueMicrotask(() => {
      this.searchInput?.nativeElement.focus();
      if (select) this.searchInput?.nativeElement.select();
    });
  }

  onInput(event: Event): void {
    this.queryChange.emit((event.target as HTMLInputElement).value);
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();

      if (event.shiftKey) {
        this.previous.emit();
        return;
      }

      this.next.emit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
    }
  }
}
