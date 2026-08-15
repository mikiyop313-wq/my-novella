import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CodexContextTrieService } from '../services/codex-context-trie.service';
import { CodexEntryOpenerService } from '../services/codex-entry-opener.service';
import { CodexContextHighlightDirective } from './codex-context-highlight.directive';
import {
  CodexContextHighlightRegistryService,
  type CodexEntryHighlightRange,
} from './codex-context-highlight-registry.service';
import { CodexMatchChooserService } from './codex-match-chooser.service';

@Component({
  standalone: true,
  imports: [CodexContextHighlightDirective],
  template: `
    <div class="host" codexContextHighlight>
      <p class="inline">Mara <strong>Vale</strong></p>
      <p class="second">Mara Vale</p>
      <p>Silver</p>
      <p>Key</p>
      <button>Mara Vale</button>
      <p data-codex-highlight-ignore>Mara Vale</p>
    </div>
  `,
})
class TestHostComponent {}

describe('CodexContextHighlightDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let frameCallbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
  const trieState = signal<object | null>({});
  const registry = {
    setRanges: vi.fn(),
    clearRanges: vi.fn(),
    getEntryIdsAtPoint: vi.fn<() => string[]>(() => []),
  };
  const entryOpener = { open: vi.fn(async () => undefined) };
  const chooser = { open: vi.fn() };
  const contextTrie = {
    trie: trieState.asReadonly(),
    findMatches: vi.fn((text: string) => findMaraMatches(text)),
  };

  beforeEach(() => {
    frameCallbacks = new Map();
    nextFrameId = 1;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        frameCallbacks.set(id, callback);
        return id;
      }),
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn((id: number) => frameCallbacks.delete(id)),
    });

    registry.setRanges.mockClear();
    registry.clearRanges.mockClear();
    registry.getEntryIdsAtPoint.mockReset().mockReturnValue([]);
    entryOpener.open.mockClear();
    chooser.open.mockClear();
    contextTrie.findMatches.mockReset().mockImplementation((text: string) => findMaraMatches(text));
    trieState.set({});

    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        { provide: CodexContextTrieService, useValue: contextTrie },
        { provide: CodexContextHighlightRegistryService, useValue: registry },
        { provide: CodexEntryOpenerService, useValue: entryOpener },
        { provide: CodexMatchChooserService, useValue: chooser },
      ],
    });
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalRequestAnimationFrame,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalCancelAnimationFrame,
    });
  });

  it('registers inline-spanning matches without crossing blocks or exclusions', () => {
    flushFrames();

    const ranges = (registry.setRanges.mock.calls.at(-1)?.[1] ?? []) as CodexEntryHighlightRange[];
    expect(ranges.map((item) => item.range.toString())).toEqual(['Mara Vale', 'Mara Vale']);
    expect(contextTrie.findMatches).toHaveBeenCalledWith('Silver');
    expect(contextTrie.findMatches).toHaveBeenCalledWith('Key');
    expect(contextTrie.findMatches).not.toHaveBeenCalledWith('SilverKey');
  });

  it('registers plain and punctuated matches, resolves overlaps, and deduplicates entry IDs', async () => {
    flushFrames();
    contextTrie.findMatches.mockImplementation((text: string) => {
      if (text !== 'Mara Vale, Silver Key.') return [];
      return [
        createMatch('Mara Vale', 'codex-1', 0, 9),
        createMatch('Mara Vale', 'codex-1', 0, 9),
        createMatch('Mara Vale', 'codex-2', 0, 9),
        createMatch('Mara', 'codex-overlap', 0, 4),
        createMatch('Silver Key', 'codex-3', 11, 21),
      ];
    });
    host().innerHTML = '<p>Mara Vale, Silver Key.</p>';
    await Promise.resolve();
    flushFrames();

    expect(lastRanges().map((item) => [item.entryId, item.range.toString()])).toEqual([
      ['codex-1', 'Mara Vale'],
      ['codex-2', 'Mara Vale'],
      ['codex-3', 'Silver Key'],
    ]);
  });

  it('targets matching descendants and safely clears for missing or invalid selectors', async () => {
    flushFrames();
    host().innerHTML = '<p class="target">Mara Vale</p><p class="other">Mara Vale</p>';
    directive().codexContextHighlight = '.target';
    await Promise.resolve();
    flushFrames();
    expect(lastRanges().map((item) => item.range.toString())).toEqual(['Mara Vale']);

    directive().codexContextHighlight = '.missing';
    flushFrames();
    expect(lastRanges()).toEqual([]);

    directive().codexContextHighlight = '[';
    flushFrames();
    expect(lastRanges()).toEqual([]);
  });

  it('rescans when the matcher trie changes', () => {
    flushFrames();
    registry.setRanges.mockClear();

    trieState.set({ refreshed: true });
    fixture.detectChanges();

    expect(frameCallbacks.size).toBe(1);
    flushFrames();
    expect(registry.setRanges).toHaveBeenCalledTimes(1);
  });

  it('excludes controls, links, scripts, styles, noneditable and ignored subtrees', async () => {
    flushFrames();
    host().innerHTML = `
      <p class="safe">Mara Vale</p>
      <input value="Mara Vale">
      <textarea>Mara Vale</textarea>
      <select><option>Mara Vale</option></select>
      <button>Mara Vale</button>
      <a href="#">Mara Vale</a>
      <script type="text/plain">Mara Vale</script>
      <style>.Mara-Vale { color: red; }</style>
      <div contenteditable="false"><span>Mara Vale</span></div>
      <div data-codex-highlight-ignore><span>Mara Vale</span></div>
    `;
    await Promise.resolve();
    flushFrames();

    expect(lastRanges().map((item) => item.range.toString())).toEqual(['Mara Vale']);
  });

  it('coalesces DOM mutations into one animation-frame rescan', async () => {
    flushFrames();
    registry.setRanges.mockClear();

    const second = fixture.nativeElement.querySelector('.second') as HTMLElement;
    second.textContent = 'Mara';
    second.textContent = 'Mara Vale';
    await Promise.resolve();

    expect(frameCallbacks.size).toBe(1);
    flushFrames();
    expect(registry.setRanges).toHaveBeenCalledTimes(1);
  });

  it('opens unique matches and delegates duplicate matches to the chooser', () => {
    flushFrames();
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: true } as Selection);
    const target = fixture.nativeElement.querySelector('.inline') as HTMLElement;

    registry.getEntryIdsAtPoint.mockReturnValueOnce(['codex-1']);
    target.dispatchEvent(
      new MouseEvent('click', { bubbles: true, button: 0, clientX: 12, clientY: 20 }),
    );
    expect(entryOpener.open).toHaveBeenCalledWith('codex-1');

    registry.getEntryIdsAtPoint.mockReturnValueOnce(['codex-2', 'codex-1', 'codex-2']);
    target.dispatchEvent(
      new MouseEvent('click', { bubbles: true, button: 0, clientX: 12, clientY: 20 }),
    );
    expect(chooser.open).toHaveBeenCalledWith(['codex-2', 'codex-1'], 12, 20);
  });

  it('shows a pointer cursor only while hovering a highlighted keyword', () => {
    flushFrames();
    const target = fixture.nativeElement.querySelector('.inline') as HTMLElement;

    registry.getEntryIdsAtPoint.mockReturnValueOnce(['codex-1']);
    target.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 12, clientY: 20 }),
    );
    expect(host().style.cursor).toBe('pointer');

    registry.getEntryIdsAtPoint.mockReturnValueOnce([]);
    target.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 40, clientY: 20 }),
    );
    expect(host().style.cursor).toBe('');

    registry.getEntryIdsAtPoint.mockReturnValueOnce(['codex-1']);
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    host().dispatchEvent(new MouseEvent('mouseleave'));
    expect(host().style.cursor).toBe('');
  });

  it('keeps the default cursor over interactive descendants', () => {
    flushFrames();
    registry.getEntryIdsAtPoint.mockReturnValue(['codex-1']);
    const button = fixture.nativeElement.querySelector('button') as HTMLElement;

    button.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));

    expect(host().style.cursor).toBe('');
    expect(registry.getEntryIdsAtPoint).not.toHaveBeenCalled();
  });

  it('ignores guarded and unmatched clicks without changing content', () => {
    flushFrames();
    const originalHtml = host().innerHTML;
    const textTarget = fixture.nativeElement.querySelector('.inline') as HTMLElement;
    const interactiveTarget = fixture.nativeElement.querySelector('button') as HTMLElement;
    const selectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: true } as Selection);

    for (const init of [
      { button: 1 },
      { button: 0, ctrlKey: true },
      { button: 0, metaKey: true },
      { button: 0, altKey: true },
      { button: 0, shiftKey: true },
    ]) {
      textTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    }
    interactiveTarget.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );

    selectionSpy.mockReturnValueOnce({ isCollapsed: false } as Selection);
    textTarget.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );

    registry.getEntryIdsAtPoint.mockReturnValue([]);
    const unmatched = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    textTarget.dispatchEvent(unmatched);

    expect(entryOpener.open).not.toHaveBeenCalled();
    expect(chooser.open).not.toHaveBeenCalled();
    expect(unmatched.defaultPrevented).toBe(false);
    expect(host().innerHTML).toBe(originalHtml);
  });

  it('keeps content and clicks unchanged when highlight hit testing is unavailable', () => {
    flushFrames();
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: true } as Selection);
    registry.getEntryIdsAtPoint.mockReturnValue([]);
    const target = fixture.nativeElement.querySelector('.inline') as HTMLElement;
    const originalHtml = host().innerHTML;
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 12,
      clientY: 20,
    });

    expect(() => target.dispatchEvent(event)).not.toThrow();
    expect(event.defaultPrevented).toBe(false);
    expect(entryOpener.open).not.toHaveBeenCalled();
    expect(chooser.open).not.toHaveBeenCalled();
    expect(host().innerHTML).toBe(originalHtml);
  });

  it('clears owned ranges and cancels pending work when destroyed', () => {
    const pendingFrame = [...frameCallbacks.keys()][0];
    fixture.destroy();

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(pendingFrame);
    expect(registry.clearRanges).toHaveBeenCalledTimes(1);
  });

  function flushFrames(): void {
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  }

  function host(): HTMLElement {
    return fixture.nativeElement.querySelector('.host');
  }

  function directive(): CodexContextHighlightDirective {
    return fixture.debugElement.query(By.directive(CodexContextHighlightDirective)).injector.get(
      CodexContextHighlightDirective,
    );
  }

  function lastRanges(): CodexEntryHighlightRange[] {
    return (registry.setRanges.mock.calls.at(-1)?.[1] ?? []) as CodexEntryHighlightRange[];
  }
});

function findMaraMatches(text: string) {
  return [...text.matchAll(/Mara\s+Vale/gi)].map((match) => ({
    term: 'Mara Vale',
    value: {
      entryId: 'codex-1',
      trackingSetting: 'include_when_detected' as const,
      status: 'active' as const,
    },
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    text: match[0],
  }));
}

function createMatch(term: string, entryId: string, startIndex: number, endIndex: number) {
  return {
    term,
    value: {
      entryId,
      trackingSetting: 'include_when_detected' as const,
      status: 'active' as const,
    },
    startIndex,
    endIndex,
    text: term,
  };
}
