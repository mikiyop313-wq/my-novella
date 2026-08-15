import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(component.start()).toBe(true);
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

    component.start();

    expect(removeAllRanges).toHaveBeenCalledOnce();
    getSelectionSpy.mockRestore();
  });

  it('moves from drawing to generation and reveals actions after five seconds', () => {
    component.start();

    vi.advanceTimersByTime(600);
    fixture.detectChanges();
    expect(component.state()).toBe('generating');
    expect(fixture.nativeElement.querySelector('.ai-selection-effect.is-generating')).not.toBeNull();

    vi.advanceTimersByTime(4_400);
    fixture.detectChanges();
    expect(component.state()).toBe('ready');
    expect(component.frameHeight()).toBe(116);
    expect(fixture.nativeElement.querySelector('.cancel-button')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.confirm-button')).not.toBeNull();
    expect(editor.registerPlugin).toHaveBeenCalledTimes(2);
    expect(editor.unregisterPlugin).toHaveBeenCalledOnce();
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'confirm'] as const)('%s dismisses the effect without changing text', action => {
    component.start();
    vi.advanceTimersByTime(5_000);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(`.${action}-button`) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(component.state()).toBe('idle');
    expect(component.bounds()).toBeNull();
    expect(fixture.nativeElement.querySelector('.ai-selection-effect')).toBeNull();
    expect(editor.unregisterPlugin).toHaveBeenCalledTimes(2);
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('stays active when the editor selection changes', () => {
    component.start();
    editor.selection.from = 3;
    editor.selection.to = 7;

    editor.emit('selectionUpdate');
    fixture.detectChanges();

    expect(component.state()).toBe('drawing');
    expect(component.bounds()).not.toBeNull();
  });

  it('keeps ready actions visible when the user clicks outside the selection', () => {
    component.start();
    vi.advanceTimersByTime(5_000);
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
    component.start();

    editor.emit('update');
    fixture.detectChanges();

    expect(component.state()).toBe('drawing');
    expect(component.bounds()).not.toBeNull();
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('repositions the frame on scroll while the selection remains unchanged', () => {
    component.start();
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
    expect(component.start()).toBe(true);
    const initialBounds = component.bounds();
    rangeRect = createRect(200, 300, 100, 20);

    expect(component.start()).toBe(false);
    expect(component.bounds()).toEqual(initialBounds);

    component.cancel();
    editor.selection.empty = true;
    editor.selection.from = 5;
    editor.selection.to = 5;

    expect(component.start()).toBe(false);
    expect(component.state()).toBe('idle');
    expect(component.bounds()).toBeNull();
  });

  it('removes editor listeners and active timers when destroyed', () => {
    component.start();
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
  const selection = { from: 1, to: 12, empty: false };
  const textNode = document.createTextNode('Selected manuscript text');
  const dispatch = vi.fn();
  const registerPlugin = vi.fn();
  const unregisterPlugin = vi.fn();
  const on = vi.fn((event: string, handler: () => void) => handlers.set(event, handler));
  const off = vi.fn((event: string) => handlers.delete(event));
  const api = {
    state: {
      selection,
      doc: {
        textBetween: vi.fn(() => 'Selected text'),
      },
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
