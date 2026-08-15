import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
} from '@angular/core';

export interface CodexMatchChooserEntry {
  id: string;
  name: string;
}

@Component({
  selector: 'app-codex-match-chooser',
  standalone: true,
  template: `
    <div class="chooser" role="menu" aria-label="Choose Codex entry">
      <div class="title">Choose Codex entry</div>
      @for (entry of entries(); track entry.id) {
        <button type="button" role="menuitem" (click)="entrySelected.emit(entry.id)">
          {{ entry.name }}
        </button>
      }
    </div>
  `,
  styles: `
    .chooser {
      min-width: 180px;
      max-width: 280px;
      padding: 6px;
      border: 1px solid #8885;
      border-radius: 8px;
      background: var(--background-color, white);
      color: var(--text-color, #222);
      box-shadow: 0 8px 24px #0003;
    }
    .title {
      padding: 5px 8px 7px;
      opacity: 0.65;
      font-size: 0.75rem;
      font-weight: 600;
    }
    button {
      display: block;
      width: 100%;
      padding: 7px 8px;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    button:hover,
    button:focus-visible {
      outline: none;
      background: color-mix(in srgb, var(--accent-color, #7c3aed) 12%, transparent);
    }
  `,
})
export class CodexMatchChooserComponent implements AfterViewInit {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly entries = input.required<readonly CodexMatchChooserEntry[]>();
  readonly entrySelected = output<string>();
  readonly closeRequested = output<void>();

  ngAfterViewInit(): void {
    queueMicrotask(() => this.elementRef.nativeElement.querySelector('button')?.focus());
  }

  @HostListener('keydown.escape', ['$event'])
  closeOnEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeRequested.emit();
  }
}
