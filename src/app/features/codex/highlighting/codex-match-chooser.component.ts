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
  description: string | null;
}

@Component({
  selector: 'app-codex-match-chooser',
  standalone: true,
  template: `
    <div class="chooser" role="menu" aria-label="Codex entry preview">
      <div class="title">{{ entries().length === 1 ? 'Codex entry' : 'Choose Codex entry' }}</div>
      @for (entry of entries(); track entry.id) {
        <button
          type="button"
          role="menuitem"
          [attr.aria-label]="'Open ' + entry.name"
          (click)="entrySelected.emit(entry.id)"
        >
          <span class="entry-title">{{ entry.name }}</span>
          <span class="entry-description">{{
            entry.description ?? 'No description available.'
          }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    /* Entrance animation */
    @keyframes codexPreviewSlideIn {
      from {
        opacity: 0;
        transform: translateY(-18px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    :host {
      display: block;
      animation: codexPreviewSlideIn 380ms cubic-bezier(0.16, 1, 0.3, 1) both;
      transform-origin: top center;
      will-change: opacity, transform;
    }

    /* Chooser panel */
    .chooser {
      min-width: 220px;
      max-width: 320px;
      max-height: min(360px, calc(100vh - 24px));
      overflow-y: auto;
      padding: 6px;
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
      border-radius: 12px;
      background: color-mix(in srgb, var(--color-surface, #2a2a2a), transparent 0%);
      color: var(--color-text-primary, #fff);
      box-shadow:
        0 10px 25px -5px rgba(0, 0, 0, 0.4),
        0 8px 10px -6px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(16px);
      font-family: var(--body-font);
    }
    .title {
      padding: 5px 8px 7px;
      color: var(--color-text-secondary, #a3a3a3);
      font-size: 0.75rem;
      font-weight: 600;
    }
    /* Entry actions */
    button {
      display: flex;
      flex-direction: column;
      gap: 3px;
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
    .entry-title {
      font-weight: 600;
    }
    .entry-description {
      display: -webkit-box;
      overflow: hidden;
      color: var(--color-text-secondary, #a3a3a3);
      font-size: 0.8rem;
      line-height: 1.35;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }
    button:hover,
    button:focus-visible {
      outline: none;
      background: var(--color-hover-bg, rgba(255, 255, 255, 0.08));
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }
  `,
})
export class CodexMatchChooserComponent implements AfterViewInit {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly entries = input.required<readonly CodexMatchChooserEntry[]>();
  readonly entrySelected = output<string>();
  readonly closeRequested = output<void>();

  /** Focus the first result once Angular has rendered the projected entries. */
  ngAfterViewInit(): void {
    queueMicrotask(() => this.elementRef.nativeElement.querySelector('button')?.focus());
  }

  /** Let callers close the overlay while preserving normal keyboard focus flow. */
  @HostListener('keydown.escape', ['$event'])
  closeOnEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeRequested.emit();
  }
}
