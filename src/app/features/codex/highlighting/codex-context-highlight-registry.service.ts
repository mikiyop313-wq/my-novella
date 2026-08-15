import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, inject } from '@angular/core';

export interface CodexEntryHighlightRange {
  entryId: string;
  range: Range;
}

interface BrowserHighlight {
  add(range: Range): BrowserHighlight;
}

interface BrowserHighlightConstructor {
  new (...ranges: Range[]): BrowserHighlight;
}

interface HighlightHitResult {
  highlight: BrowserHighlight;
}

interface InteractiveHighlightRegistry {
  set(name: string, highlight: BrowserHighlight): void;
  delete(name: string): boolean;
  highlightsFromPoint?: (x: number, y: number) => Iterable<HighlightHitResult>;
}

type HighlightWindow = Window &
  typeof globalThis & {
    Highlight?: BrowserHighlightConstructor;
    CSS?: typeof CSS & {
      highlights?: InteractiveHighlightRegistry;
    };
  };

interface OwnedHighlight {
  name: string;
  highlight: BrowserHighlight;
}

@Injectable({
  providedIn: 'root',
})
export class CodexContextHighlightRegistryService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly owners = new Map<object, readonly CodexEntryHighlightRange[]>();
  private readonly ownedHighlights = new Map<string, OwnedHighlight>();
  private readonly highlightEntryIds = new WeakMap<BrowserHighlight, string>();
  private readonly entryNames = new Map<string, string>();
  private readonly highlightConstructor: BrowserHighlightConstructor | null;
  private readonly registry: InteractiveHighlightRegistry | null;
  private styleElement: HTMLStyleElement | null = null;
  private nextHighlightId = 1;

  readonly isSupported: boolean;

  constructor() {
    const view = this.document.defaultView as HighlightWindow | null;
    this.highlightConstructor = view?.Highlight ?? null;
    this.registry = view?.CSS?.highlights ?? null;
    this.isSupported = !!this.highlightConstructor && !!this.registry;
  }

  setRanges(owner: object, ranges: readonly CodexEntryHighlightRange[]): void {
    if (!this.isSupported) return;

    const uniqueRanges = new Map<string, Set<Range>>();

    for (const item of ranges) {
      if (!item.entryId || !item.range) continue;

      const entryRanges = uniqueRanges.get(item.entryId) ?? new Set<Range>();
      entryRanges.add(item.range);
      uniqueRanges.set(item.entryId, entryRanges);
    }

    this.owners.set(
      owner,
      [...uniqueRanges].flatMap(([entryId, entryRanges]) =>
        [...entryRanges].map((range) => ({ entryId, range })),
      ),
    );
    this.rebuildHighlights();
  }

  clearRanges(owner: object): void {
    if (!this.isSupported || !this.owners.delete(owner)) return;
    this.rebuildHighlights();
  }

  getEntryIdsAtPoint(x: number, y: number): string[] {
    const highlightsFromPoint = this.registry?.highlightsFromPoint;

    if (!this.isSupported || !highlightsFromPoint) return [];

    try {
      const entryIds = new Set<string>();

      for (const result of highlightsFromPoint.call(this.registry, x, y)) {
        const entryId = this.highlightEntryIds.get(result.highlight);
        if (entryId) entryIds.add(entryId);
      }

      return [...entryIds];
    } catch {
      return [];
    }
  }

  ngOnDestroy(): void {
    if (this.registry) {
      for (const { name } of this.ownedHighlights.values()) {
        this.registry.delete(name);
      }
    }

    this.ownedHighlights.clear();
    this.owners.clear();
    this.entryNames.clear();
    this.styleElement?.remove();
    this.styleElement = null;
  }

  private rebuildHighlights(): void {
    if (!this.registry || !this.highlightConstructor) return;

    for (const { name } of this.ownedHighlights.values()) {
      this.registry.delete(name);
    }
    this.ownedHighlights.clear();

    const rangesByEntryId = new Map<string, Set<Range>>();

    for (const ranges of this.owners.values()) {
      for (const { entryId, range } of ranges) {
        const entryRanges = rangesByEntryId.get(entryId) ?? new Set<Range>();
        entryRanges.add(range);
        rangesByEntryId.set(entryId, entryRanges);
      }
    }

    for (const [entryId, ranges] of rangesByEntryId) {
      const highlight = new this.highlightConstructor(...ranges);
      const name = this.getHighlightName(entryId);

      this.registry.set(name, highlight);
      this.highlightEntryIds.set(highlight, entryId);
      this.ownedHighlights.set(entryId, { name, highlight });
    }

    this.updateOwnedStyle();
  }

  private getHighlightName(entryId: string): string {
    const existingName = this.entryNames.get(entryId);
    if (existingName) return existingName;

    const name = `codex-context-${this.nextHighlightId++}`;
    this.entryNames.set(entryId, name);
    return name;
  }

  private updateOwnedStyle(): void {
    if (!this.styleElement) {
      this.styleElement = this.document.createElement('style');
      this.styleElement.dataset['codexContextHighlights'] = '';
      (this.document.head ?? this.document.documentElement).append(this.styleElement);
    }

    const selectors = [...this.ownedHighlights.values()]
      .map(({ name }) => `::highlight(${name})`)
      .join(',\n');

    this.styleElement.textContent = selectors
      ? `${selectors} {\n  text-decoration: underline dotted var(--color-text-secondary, #737373) 1.5px;\n  text-underline-offset: 0.18em;\n}`
      : '';
  }
}
