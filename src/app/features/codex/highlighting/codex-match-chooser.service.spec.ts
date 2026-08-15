import { Overlay } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CodexContextTrieService } from '../services/codex-context-trie.service';
import { CodexEntryOpenerService } from '../services/codex-entry-opener.service';
import { CodexMatchChooserService } from './codex-match-chooser.service';

describe('CodexMatchChooserService', () => {
  let service: CodexMatchChooserService;
  let entries: Array<{ id: string; name: string }>;
  let overlay: ReturnType<typeof createOverlay>;
  let opener: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    entries = [
      { id: 'codex-b', name: 'alpha' },
      { id: 'codex-a', name: 'Alpha' },
      { id: 'codex-c', name: 'Mara Vale' },
    ];
    overlay = createOverlay();
    opener = { open: vi.fn(async () => undefined) };

    TestBed.configureTestingModule({
      providers: [
        CodexMatchChooserService,
        { provide: Overlay, useValue: overlay.api },
        { provide: CodexContextTrieService, useValue: { entries: vi.fn(() => entries) } },
        { provide: CodexEntryOpenerService, useValue: opener },
      ],
    });
    service = TestBed.inject(CodexMatchChooserService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('deduplicates IDs, ignores unknown entries, and sorts by name then ID', () => {
    service.open(['codex-c', 'missing', 'codex-b', 'codex-a', 'codex-c'], 12, 20);

    expect(overlay.refs[0].setInput).toHaveBeenCalledWith('entries', [
      { id: 'codex-a', name: 'Alpha' },
      { id: 'codex-b', name: 'alpha' },
      { id: 'codex-c', name: 'Mara Vale' },
    ]);
  });

  it('does nothing for zero resolved entries', () => {
    service.open(['missing'], 12, 20);

    expect(overlay.api.create).not.toHaveBeenCalled();
    expect(opener.open).not.toHaveBeenCalled();
  });

  it('opens one resolved entry directly without creating an overlay', () => {
    service.open(['missing', 'codex-c', 'codex-c'], 12, 20);

    expect(opener.open).toHaveBeenCalledWith('codex-c');
    expect(overlay.api.create).not.toHaveBeenCalled();
  });

  it('creates a coordinate-connected overlay with fallback positions and reposition scrolling', () => {
    service.open(['codex-a', 'codex-c'], 12, 20);

    expect(overlay.flexibleConnectedTo).toHaveBeenCalledWith({ x: 12, y: 20 });
    expect(overlay.withFlexibleDimensions).toHaveBeenCalledWith(false);
    expect(overlay.withPush).toHaveBeenCalledWith(true);
    expect(overlay.withPositions).toHaveBeenCalledWith([
      {
        originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top',
        offsetX: 4, offsetY: 4,
      },
      {
        originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top',
        offsetX: -4, offsetY: 4,
      },
      {
        originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom',
        offsetX: 4, offsetY: -4,
      },
      {
        originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom',
        offsetX: -4, offsetY: -4,
      },
    ]);
    expect(overlay.reposition).toHaveBeenCalledTimes(1);
    expect(overlay.api.create).toHaveBeenCalledWith(expect.objectContaining({
      positionStrategy: overlay.positionStrategy,
      scrollStrategy: overlay.scrollStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      panelClass: 'codex-match-chooser-overlay',
    }));
  });

  it('closes the overlay before opening a selected entry', () => {
    service.open(['codex-a', 'codex-c'], 12, 20);
    const ref = overlay.refs[0];
    opener.open.mockImplementation(async () => {
      expect(ref.dispose).toHaveBeenCalledTimes(1);
    });

    ref.entrySelected.next('codex-c');

    expect(opener.open).toHaveBeenCalledWith('codex-c');
  });

  it('disposes on backdrop, Escape, close request, detach, replacement, and destruction', () => {
    service.open(['codex-a', 'codex-c'], 12, 20);
    const backdropRef = overlay.refs.at(-1)!;
    backdropRef.backdrop.next();
    expect(backdropRef.dispose).toHaveBeenCalledTimes(1);

    service.open(['codex-a', 'codex-c'], 12, 20);
    const escapeRef = overlay.refs.at(-1)!;
    const escapeEvent = { key: 'Escape', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    escapeRef.keydown.next(escapeEvent);
    expect(escapeEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(escapeRef.dispose).toHaveBeenCalledTimes(1);

    service.open(['codex-a', 'codex-c'], 12, 20);
    const requestRef = overlay.refs.at(-1)!;
    requestRef.closeRequested.next();
    expect(requestRef.dispose).toHaveBeenCalledTimes(1);

    service.open(['codex-a', 'codex-c'], 12, 20);
    const detachedRef = overlay.refs.at(-1)!;
    detachedRef.detached.next();
    expect(detachedRef.dispose).toHaveBeenCalledTimes(1);

    service.open(['codex-a', 'codex-c'], 12, 20);
    const replacedRef = overlay.refs.at(-1)!;
    service.open(['codex-a', 'codex-c'], 30, 40);
    expect(replacedRef.dispose).toHaveBeenCalledTimes(1);

    const destroyedRef = overlay.refs.at(-1)!;
    TestBed.resetTestingModule();
    expect(destroyedRef.dispose).toHaveBeenCalledTimes(1);
  });
});

function createOverlay() {
  const refs: ReturnType<typeof createOverlayRef>[] = [];
  const positionStrategy = {};
  const scrollStrategy = {};
  const withFlexibleDimensions = vi.fn(() => strategy);
  const withPush = vi.fn(() => strategy);
  const withPositions = vi.fn(() => positionStrategy);
  const strategy = { withFlexibleDimensions, withPush, withPositions };
  const flexibleConnectedTo = vi.fn(() => strategy);
  const reposition = vi.fn(() => scrollStrategy);
  const api = {
    position: vi.fn(() => ({ flexibleConnectedTo })),
    scrollStrategies: { reposition },
    create: vi.fn(() => {
      const ref = createOverlayRef();
      refs.push(ref);
      return ref;
    }),
  };

  return {
    api,
    refs,
    positionStrategy,
    scrollStrategy,
    flexibleConnectedTo,
    withFlexibleDimensions,
    withPush,
    withPositions,
    reposition,
  };
}

function createOverlayRef() {
  const entrySelected = new Subject<string>();
  const closeRequested = new Subject<void>();
  const backdrop = new Subject<void>();
  const detachments = new Subject<void>();
  const keydown = new Subject<KeyboardEvent>();
  const setInput = vi.fn();

  return {
    entrySelected,
    closeRequested,
    backdrop,
    detached: detachments,
    keydown,
    setInput,
    dispose: vi.fn(),
    attach: vi.fn(() => ({
      setInput,
      instance: { entrySelected, closeRequested },
    })),
    backdropClick: vi.fn(() => backdrop.asObservable()),
    detachments: vi.fn(() => detachments.asObservable()),
    keydownEvents: vi.fn(() => keydown.asObservable()),
  };
}
