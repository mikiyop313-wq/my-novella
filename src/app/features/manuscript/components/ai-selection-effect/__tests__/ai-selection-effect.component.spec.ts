import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiStreamService } from '../../../../../core/services/ai-stream.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { WorkspaceStore } from '../../../../workspace/workspace.store';
import { ManuscriptStructureService } from '../../../../workspace/services/manuscript-structure.service';
import { CodexContextTrieService } from '../../../../codex/services/codex-context-trie.service';
import { CodexService } from '../../../../codex/services/codex.service';
import { ManuscriptStore } from '../../../store/manuscript.store';
import { AiSelectionEffectComponent } from '../ai-selection-effect.component';

describe('AiSelectionEffectComponent', () => {
  let component: AiSelectionEffectComponent;
  let fixture: ComponentFixture<AiSelectionEffectComponent>;
  let editor: ReturnType<typeof createEditor>;
  let rangeRect: DOMRect;
  let createRangeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    editor = createEditor();
    rangeRect = createRect(40, 100, 220, 48);
    createRangeSpy = vi.spyOn(document, 'createRange').mockImplementation(() => ({
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getBoundingClientRect: () => rangeRect,
    }) as unknown as Range);

    await TestBed.configureTestingModule({
      imports: [AiSelectionEffectComponent],
      providers: [
        { provide: ManuscriptStore, useValue: { editor: signal(editor.api) } },
        {
          provide: WorkspaceStore,
          useValue: { bookId: signal('book-1'), bookTitle: signal('Book One') },
        },
        {
          provide: CodexContextTrieService,
          useValue: {
            trie: signal({}), isLoading: signal(false), error: signal(null), findMatches: vi.fn(() => []),
          },
        },
        { provide: CodexService, useValue: { getEntry: vi.fn() } },
        { provide: ManuscriptStructureService, useValue: { getOutline: vi.fn() } },
        {
          provide: AiStreamService,
          useValue: { streamText: vi.fn(() => new Promise(() => undefined)), stopStream: vi.fn() },
        },
        { provide: ToastService, useValue: { error: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiSelectionEffectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    createRangeSpy.mockRestore();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('starts the visual workflow for a valid selection', () => {
    expect(startEdit(component)).toBe(true);
    fixture.detectChanges();

    expect(component.state()).toBe('drawing');
    expect(component.bounds()).toEqual({
      top: 90,
      left: 30,
      width: 240,
      height: 68,
    });
    expect(editor.registerPlugin).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('.ai-selection-effect.is-drawing')).not.toBeNull();
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('clears the native text highlight when generation starts', () => {
    const removeAllRanges = vi.fn();
    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      removeAllRanges,
    } as unknown as Selection);

    startEdit(component);

    expect(removeAllRanges).toHaveBeenCalledOnce();
    getSelectionSpy.mockRestore();
  });

  it.each(['cancel', 'confirm'] as const)('%s dismisses the effect without changing text', action => {
    startEdit(component);
    vi.advanceTimersByTime(600);
    component[action]();
    fixture.detectChanges();

    expect(component.state()).toBe('idle');
    expect(component.bounds()).toBeNull();
    expect(fixture.nativeElement.querySelector('.ai-selection-effect')).toBeNull();
    expect(editor.unregisterPlugin).toHaveBeenCalledOnce();
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('stays active when the editor selection changes', () => {
    startEdit(component);
    editor.selection.from = 3;
    editor.selection.to = 7;

    editor.emit('selectionUpdate');
    fixture.detectChanges();

    expect(component.state()).toBe('drawing');
    expect(component.bounds()).not.toBeNull();
  });

  it('keeps ready actions visible when the user clicks outside the selection', () => {
    startEdit(component);
    vi.advanceTimersByTime(600);
    component.state.set('ready');
    editor.selection.empty = true;
    editor.selection.from = 20;
    editor.selection.to = 20;

    editor.emit('selectionUpdate');
    fixture.detectChanges();

    expect(component.state()).toBe('ready');
    expect(component.bounds()).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.cancel-button')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.confirm-button')).not.toBeNull();
  });

  it('stays active when the editor document changes', () => {
    startEdit(component);

    editor.emit('update');
    fixture.detectChanges();

    expect(component.state()).toBe('drawing');
    expect(component.bounds()).not.toBeNull();
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('repositions the frame on scroll while the selection remains unchanged', () => {
    startEdit(component);
    rangeRect = createRect(70, 140, 180, 36);

    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.bounds()).toEqual({
      top: 130,
      left: 60,
      width: 200,
      height: 56,
    });
  });

  it('rejects repeated starts and invalid selections', () => {
    expect(startEdit(component)).toBe(true);
    const initialBounds = component.bounds();
    rangeRect = createRect(200, 300, 100, 20);

    expect(startEdit(component)).toBe(false);
    expect(component.bounds()).toEqual(initialBounds);

    component.cancel();
    editor.selection.empty = true;
    editor.selection.from = 5;
    editor.selection.to = 5;

    expect(startEdit(component)).toBe(false);
    expect(component.state()).toBe('idle');
    expect(component.bounds()).toBeNull();
  });

  it('removes editor listeners and active timers when destroyed', () => {
    startEdit(component);
    fixture.destroy();

    expect(editor.off).toHaveBeenCalledWith('selectionUpdate', expect.any(Function));
    expect(editor.off).toHaveBeenCalledWith('update', expect.any(Function));
    expect(component.state()).toBe('idle');

    vi.advanceTimersByTime(5_000);
    expect(component.state()).toBe('idle');
  });
});

function createEditor() {
  const handlers = new Map<string, () => void>();
  const selection = { from: 3, to: 16, empty: false };
  const textNode = document.createTextNode('Selected manuscript text');
  const dispatch = vi.fn();
  const registerPlugin = vi.fn();
  const unregisterPlugin = vi.fn();
  const on = vi.fn((event: string, handler: () => void) => handlers.set(event, handler));
  const off = vi.fn((event: string) => handlers.delete(event));
  const doc = {
    content: { size: 27 },
    forEach: vi.fn((callback: (node: any, offset: number) => void) => {
      callback({
        type: { name: 'sceneSummary' },
        attrs: { id: 'scene-1', title: 'Test Scene' },
        nodeSize: 2,
      }, 0);
      callback({ type: { name: 'paragraph' }, attrs: {}, nodeSize: 25 }, 2);
    }),
    textBetween: vi.fn(() => 'Selected text'),
    slice: vi.fn(() => ({})),
  };
  const api = {
    state: {
      selection,
      doc,
    },
    view: {
      domAtPos: vi.fn((position: number) => ({
        node: textNode,
        offset: position === selection.from ? 0 : textNode.textContent?.length ?? 0,
      })),
      dispatch,
    },
    on,
    off,
    registerPlugin,
    unregisterPlugin,
  } as unknown as Editor;

  return {
    api,
    dispatch,
    emit: (event: string) => handlers.get(event)?.(),
    off,
    registerPlugin,
    selection,
    unregisterPlugin,
  };
}

function startEdit(component: AiSelectionEffectComponent): boolean {
  return component.startEdit({
    category: 'rephrase',
    instruction: 'Rephrase the marked passage.',
    actionLabel: 'Rephrase',
  });
}

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}
