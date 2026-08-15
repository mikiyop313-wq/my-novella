import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CodexContextHighlightRegistryService } from './codex-context-highlight-registry.service';

class FakeHighlight {
  readonly ranges: Range[];

  constructor(...ranges: Range[]) {
    this.ranges = [...ranges];
  }

  add(range: Range): FakeHighlight {
    this.ranges.push(range);
    return this;
  }
}

describe('CodexContextHighlightRegistryService', () => {
  let registrations: Map<string, FakeHighlight>;
  let browserRegistry: {
    set: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    highlightsFromPoint?: ReturnType<typeof vi.fn>;
  };
  let originalHighlight: PropertyDescriptor | undefined;
  let originalCss: PropertyDescriptor | undefined;

  beforeEach(() => {
    registrations = new Map();
    browserRegistry = {
      set: vi.fn((name: string, highlight: FakeHighlight) => {
        registrations.set(name, highlight);
      }),
      delete: vi.fn((name: string) => registrations.delete(name)),
      highlightsFromPoint: vi.fn(() => []),
    };
    originalHighlight = Object.getOwnPropertyDescriptor(window, 'Highlight');
    originalCss = Object.getOwnPropertyDescriptor(window, 'CSS');
    installBrowserApi();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.querySelectorAll('style[data-codex-context-highlights]').forEach((style) => style.remove());
    restoreProperty('Highlight', originalHighlight);
    restoreProperty('CSS', originalCss);
  });

  it('safely no-ops when the browser Highlight API is unsupported', () => {
    Object.defineProperty(window, 'Highlight', { configurable: true, value: undefined });
    const service = createService();

    expect(service.isSupported).toBe(false);
    expect(() => service.setRanges({}, [{ entryId: 'codex-1', range: createRange('Mara') }]))
      .not.toThrow();
    expect(service.getEntryIdsAtPoint(1, 2)).toEqual([]);
    expect(registrations.size).toBe(0);
    expect(document.querySelector('style[data-codex-context-highlights]')).toBeNull();
  });

  it('returns no hit IDs when point hit-testing is missing or throws', () => {
    delete browserRegistry.highlightsFromPoint;
    const missingService = createService();
    expect(missingService.getEntryIdsAtPoint(1, 2)).toEqual([]);

    TestBed.resetTestingModule();
    browserRegistry.highlightsFromPoint = vi.fn(() => {
      throw new Error('unsupported');
    });
    const throwingService = createService();
    expect(throwingService.getEntryIdsAtPoint(1, 2)).toEqual([]);
  });

  it('aggregates owners and preserves unaffected owners during replacement and clearing', () => {
    const service = createService();
    const firstOwner = {};
    const secondOwner = {};
    const mara = createRange('Mara');
    const vale = createRange('Vale');
    const silver = createRange('Silver');

    service.setRanges(firstOwner, [{ entryId: 'codex-1', range: mara }]);
    service.setRanges(secondOwner, [{ entryId: 'codex-1', range: vale }]);

    expect(onlyOwnedHighlights()[0].ranges).toEqual([mara, vale]);

    service.setRanges(firstOwner, [{ entryId: 'codex-2', range: silver }]);
    expect(ownedHighlightsByRangeText()).toEqual({ Vale: 1, Silver: 1 });

    service.clearRanges(firstOwner);
    expect(ownedHighlightsByRangeText()).toEqual({ Vale: 1 });
  });

  it('does not register the same Range object repeatedly', () => {
    const service = createService();
    const range = createRange('Mara');

    service.setRanges({}, [
      { entryId: 'codex-1', range },
      { entryId: 'codex-1', range },
    ]);

    expect(onlyOwnedHighlights()).toHaveLength(1);
    expect(onlyOwnedHighlights()[0].ranges).toEqual([range]);
  });

  it('maps owned hit highlights to unique entry IDs and ignores foreign highlights', () => {
    const foreign = new FakeHighlight(createRange('Foreign'));
    registrations.set('foreign-highlight', foreign);
    const service = createService();
    service.setRanges({}, [
      { entryId: 'codex-1', range: createRange('Mara') },
      { entryId: 'codex-2', range: createRange('Vale') },
    ]);
    const [first, second] = onlyOwnedHighlights();
    browserRegistry.highlightsFromPoint!.mockReturnValue([
      { highlight: first },
      { highlight: first },
      { highlight: foreign },
      { highlight: second },
    ]);

    expect(service.getEntryIdsAtPoint(12, 20)).toEqual(['codex-1', 'codex-2']);
  });

  it('never clears foreign registrations while rebuilding owned highlights', () => {
    const foreign = new FakeHighlight(createRange('Foreign'));
    registrations.set('foreign-highlight', foreign);
    const service = createService();
    const owner = {};

    service.setRanges(owner, [{ entryId: 'codex-1', range: createRange('Mara') }]);
    service.setRanges(owner, [{ entryId: 'codex-2', range: createRange('Vale') }]);
    service.clearRanges(owner);

    expect(registrations.get('foreign-highlight')).toBe(foreign);
    expect(browserRegistry.delete).not.toHaveBeenCalledWith('foreign-highlight');
  });

  it('destroys only owned highlights, style, and owner state', () => {
    const foreign = new FakeHighlight(createRange('Foreign'));
    registrations.set('foreign-highlight', foreign);
    const service = createService();
    const owner = {};
    service.setRanges(owner, [{ entryId: 'codex-1', range: createRange('Mara') }]);
    const ownedName = [...registrations.keys()].find((name) => name !== 'foreign-highlight')!;
    const ownedStyle = document.querySelector('style[data-codex-context-highlights]');
    expect(ownedStyle?.textContent).toContain('var(--color-text-secondary, #737373)');

    service.ngOnDestroy();

    expect(registrations.get('foreign-highlight')).toBe(foreign);
    expect(registrations.has(ownedName)).toBe(false);
    expect(browserRegistry.delete).not.toHaveBeenCalledWith('foreign-highlight');
    expect(ownedStyle?.isConnected).toBe(false);

  });

  function installBrowserApi(): void {
    Object.defineProperty(window, 'Highlight', {
      configurable: true,
      value: FakeHighlight,
    });
    Object.defineProperty(window, 'CSS', {
      configurable: true,
      value: { highlights: browserRegistry },
    });
  }

  function createService(): CodexContextHighlightRegistryService {
    TestBed.configureTestingModule({ providers: [CodexContextHighlightRegistryService] });
    return TestBed.inject(CodexContextHighlightRegistryService);
  }

  function onlyOwnedHighlights(): FakeHighlight[] {
    return [...registrations]
      .filter(([name]) => name !== 'foreign-highlight')
      .map(([, highlight]) => highlight);
  }

  function ownedHighlightsByRangeText(): Record<string, number> {
    return Object.fromEntries(
      onlyOwnedHighlights().map((highlight) => [
        highlight.ranges.map((range) => range.toString()).join('|'),
        highlight.ranges.length,
      ]),
    );
  }

  function restoreProperty(name: 'Highlight' | 'CSS', descriptor: PropertyDescriptor | undefined) {
    if (descriptor) Object.defineProperty(window, name, descriptor);
    else delete (window as unknown as Record<string, unknown>)[name];
  }
});

function createRange(text: string): Range {
  const node = document.createTextNode(text);
  const range = document.createRange();
  range.selectNodeContents(node);
  return range;
}
