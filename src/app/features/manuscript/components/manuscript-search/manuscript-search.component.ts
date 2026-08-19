import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, ViewChild, input, output } from '@angular/core';

@Component({
  selector: 'app-manuscript-search',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manuscript-search.component.html',
  styleUrl: './manuscript-search.component.scss',
})
export class ManuscriptSearchComponent implements AfterViewInit {
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  readonly query = input('');
  readonly currentMatch = input(0);
  readonly totalMatches = input(0);
  readonly wholeManuscript = input(false);
  readonly matchCase = input(false);
  readonly wholeWord = input(false);
  readonly loading = input(false);
  readonly error = input<string | null>(null);

  readonly queryChange = output<string>();
  readonly wholeManuscriptChange = output<boolean>();
  readonly matchCaseChange = output<boolean>();
  readonly wholeWordChange = output<boolean>();
  readonly previous = output<void>();
  readonly next = output<void>();
  readonly closed = output<void>();
  readonly retry = output<void>();

  ngAfterViewInit(): void {
    this.focusInput();
  }

  focusInput(): void {
    queueMicrotask(() => {
      this.searchInput?.nativeElement.focus();
      this.searchInput?.nativeElement.select();
    });
  }

  onInput(event: Event): void {
    this.queryChange.emit((event.target as HTMLInputElement).value);
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) this.previous.emit();
      else this.next.emit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
    }
  }
}
