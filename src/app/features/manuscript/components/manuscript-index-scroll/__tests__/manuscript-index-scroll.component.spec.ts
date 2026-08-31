import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ManuscriptStore } from '../../../store/manuscript.store';
import {
  ManuscriptIndexItem,
  ManuscriptIndexScrollComponent,
} from '../manuscript-index-scroll.component';

const ITEMS: ManuscriptIndexItem[] = [
  { id: 'act-1', label: 'Act 1', type: 'act' },
  { id: 'chapter-1', label: 'Chapter 1', type: 'chapter' },
  { id: 'scene-1', label: 'Scene 1', type: 'scene' },
];

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
}

describe('ManuscriptIndexScrollComponent', () => {
  let component: ManuscriptIndexScrollComponent;
  let fixture: ComponentFixture<ManuscriptIndexScrollComponent>;
  let indexTrack: HTMLElement;
  let scrollContainer: HTMLElement;
  let activeSectionId: ReturnType<typeof signal<string | null>>;
  let setActiveSection: ReturnType<typeof vi.fn>;
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    MockResizeObserver.instances = [];
    originalResizeObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: MockResizeObserver,
    });

    activeSectionId = signal<string | null>(null);
    setActiveSection = vi.fn((_type: ManuscriptIndexItem['type'], id: string) => {
      activeSectionId.set(id);
    });

    await TestBed.configureTestingModule({
      imports: [ManuscriptIndexScrollComponent],
      providers: [{
        provide: ManuscriptStore,
        useValue: {
          activeSectionId,
          activeAncestors: vi.fn(() => {
            if (activeSectionId() === 'scene-1') {
              return { actId: 'act-1', chapterId: 'chapter-1' };
            }

            if (activeSectionId() === 'chapter-1') {
              return { actId: 'act-1', chapterId: null };
            }

            return { actId: null, chapterId: null };
          }),
          setActiveSection,
        },
      }],
    }).compileComponents();

    scrollContainer = createScrollContainer();
    document.body.appendChild(scrollContainer);
    addSection('act-1', 60);
    addSection('chapter-1', 200);
    addSection('scene-1', 900);

    fixture = TestBed.createComponent(ManuscriptIndexScrollComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('items', ITEMS);
    fixture.detectChanges();
    indexTrack = fixture.nativeElement.querySelector('.scrollbar-track') as HTMLElement;
    Object.defineProperty(indexTrack, 'clientHeight', { configurable: true, value: 200 });
    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    setActiveSection.mockClear();
  });

  afterEach(() => {
    fixture.destroy();
    scrollContainer.remove();
    document.querySelectorAll('[data-index-scroll-test-section]').forEach(element => element.remove());
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: originalResizeObserver,
    });
    vi.useRealTimers();
  });

  it('updates the thumb at the top, middle, and bottom of the manuscript', () => {
    expect(component.thumbHeight()).toBe(20);
    expect(component.thumbTop()).toBe(0);

    scrollTo(400);
    expect(component.thumbTop()).toBe(40);

    scrollTo(800);
    expect(component.thumbTop()).toBe(80);
  });

  it('preserves proportional marker positions that already have enough space', () => {
    expect(markerTopPixels()).toEqual([12, 40, 180]);
  });

  it('adds an eight pixel gap between crowded markers in document order', () => {
    setSectionPosition('chapter-1', 62);
    setSectionPosition('scene-1', 64);
    triggerResize();
    fixture.detectChanges();

    expect(markerTopPixels()).toEqual([12, 20, 28]);

    scrollTo(43);
    expect(activeSectionId()).toBe('chapter-1');
  });

  it('shifts crowded bottom markers upward so they stay inside the track', () => {
    setSectionPosition('chapter-1', 980);
    setSectionPosition('scene-1', 990);
    fixture.componentRef.setInput('items', ITEMS.slice(1));
    fixture.detectChanges();
    vi.advanceTimersByTime(100);
    fixture.detectChanges();

    expect(markerTopPixels()).toEqual([192, 200]);
  });

  it('compresses the gap evenly when all markers cannot fit at eight pixels', () => {
    Object.defineProperty(indexTrack, 'clientHeight', { configurable: true, value: 16 });
    setSectionPosition('act-1', 60);
    setSectionPosition('chapter-1', 61);
    setSectionPosition('scene-1', 62);
    addSection('scene-2', 63);
    fixture.componentRef.setInput('items', [
      ...ITEMS,
      { id: 'scene-2', label: 'Scene 2', type: 'scene' },
    ]);
    fixture.detectChanges();
    vi.advanceTimersByTime(100);
    fixture.detectChanges();

    const positions = markerTopPixels();
    expect(positions[0]).toBeCloseTo(0);
    expect(positions[3]).toBeCloseTo(16);
    expect(positions[1] - positions[0]).toBeCloseTo(16 / 3);
    expect(positions[2] - positions[1]).toBeCloseTo(16 / 3);
    expect(positions[3] - positions[2]).toBeCloseTo(16 / 3);
  });

  it('recalculates marker spacing when the track height changes', () => {
    setSectionPosition('chapter-1', 62);
    setSectionPosition('scene-1', 64);
    triggerResize();
    fixture.detectChanges();
    expect(markerTopPixels()).toEqual([12, 20, 28]);

    Object.defineProperty(indexTrack, 'clientHeight', { configurable: true, value: 400 });
    triggerResize();
    fixture.detectChanges();

    expect(markerTopPixels()).toEqual([24, 32, 40]);
  });

  it('maps track clicks and thumb dragging to manuscript scroll positions', () => {
    const track = fixture.nativeElement.querySelector('.scrollbar-track') as HTMLElement;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(rectAt(0, 500));
    Object.defineProperty(track, 'clientHeight', { configurable: true, value: 500 });

    component.onTrackPointerDown({
      clientY: 250,
      currentTarget: track,
      target: track,
    } as unknown as PointerEvent);
    expect(scrollContainer.scrollTop).toBe(400);

    const thumb = fixture.nativeElement.querySelector('.scrollbar-thumb') as HTMLElement;
    thumb.setPointerCapture = vi.fn();
    thumb.hasPointerCapture = vi.fn(() => true);
    thumb.releasePointerCapture = vi.fn();

    component.onThumbPointerDown({
      clientY: 100,
      currentTarget: thumb,
      pointerId: 1,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent);
    component.onThumbPointerMove({
      clientY: 150,
      currentTarget: thumb,
    } as unknown as PointerEvent);
    expect(scrollContainer.scrollTop).toBe(500);

    component.onThumbPointerUp({ currentTarget: thumb, pointerId: 1 } as unknown as PointerEvent);
    expect(component.isDragging()).toBe(false);
    expect(thumb.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('tracks the active section and highlights its ancestors while scrolling', () => {
    scrollTo(190);
    fixture.detectChanges();

    expect(activeSectionId()).toBe('chapter-1');
    expect(setActiveSection).toHaveBeenLastCalledWith('chapter', 'chapter-1');

    scrollTo(880);
    fixture.detectChanges();

    const markers = fixture.nativeElement.querySelectorAll('.scrollbar-marker');
    expect(activeSectionId()).toBe('scene-1');
    expect(Array.from(markers).every(marker => (marker as HTMLElement).classList.contains('active'))).toBe(true);
  });

  it('activates a short final section when the manuscript reaches the bottom', () => {
    scrollTo(800);

    expect(activeSectionId()).toBe('scene-1');
    expect(setActiveSection).toHaveBeenLastCalledWith('scene', 'scene-1');
  });

  it('resolves an interrupted marker scroll to the section actually in view', () => {
    component.onItemClick(ITEMS[2]);
    expect(activeSectionId()).toBe('scene-1');

    scrollTo(190);

    expect(activeSectionId()).toBe('chapter-1');
    expect(setActiveSection).toHaveBeenLastCalledWith('chapter', 'chapter-1');
  });

  it('updates labels without rebinding tracking when item structure is unchanged', () => {
    const resizeObserver = MockResizeObserver.instances[0];
    const initialObserveCalls = resizeObserver.observe.mock.calls.length;
    const addEventListener = vi.spyOn(scrollContainer, 'addEventListener');

    fixture.componentRef.setInput('items', ITEMS.map(item => (
      item.id === 'scene-1' ? { ...item, label: 'Renamed scene' } : item
    )));
    fixture.detectChanges();
    vi.advanceTimersByTime(100);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Renamed scene');
    expect(resizeObserver.observe).toHaveBeenCalledTimes(initialObserveCalls);
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('recalculates markers for structural changes without rebinding listeners', () => {
    const addEventListener = vi.spyOn(scrollContainer, 'addEventListener');
    addSection('scene-2', 700);

    fixture.componentRef.setInput('items', [
      ...ITEMS,
      { id: 'scene-2', label: 'Scene 2', type: 'scene' },
    ]);
    fixture.detectChanges();
    vi.advanceTimersByTime(100);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.scrollbar-marker')).toHaveLength(4);
    expect(addEventListener).not.toHaveBeenCalled();

    fixture.componentRef.setInput('items', ITEMS.slice(0, 2));
    fixture.detectChanges();
    vi.advanceTimersByTime(100);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.scrollbar-marker')).toHaveLength(2);
  });

  it('disconnects tracking and cancels pending layout work when destroyed', () => {
    const resizeObserver = MockResizeObserver.instances[0];
    const removeEventListener = vi.spyOn(scrollContainer, 'removeEventListener');
    const calculatePositions = vi.spyOn(
      component as unknown as { calculatePositions: () => void },
      'calculatePositions',
    );

    fixture.componentRef.setInput('items', ITEMS.slice(0, 2));
    fixture.detectChanges();
    fixture.destroy();
    vi.advanceTimersByTime(100);

    expect(resizeObserver.disconnect).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(calculatePositions).not.toHaveBeenCalled();
  });

  function createScrollContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'editor-content-wrapper';
    container.appendChild(Object.assign(document.createElement('div'), { className: 'tiptap' }));
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 1000 });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rectAt(100, 200));
    const scrollTo = vi.fn((options: ScrollToOptions) => {
      if (typeof options === 'object' && options.top !== undefined) {
        container.scrollTop = options.top;
        container.dispatchEvent(new Event('scroll'));
      }
    });
    container.scrollTo = scrollTo as typeof container.scrollTo;
    return container;
  }

  function addSection(id: string, absoluteTop: number): void {
    const section = document.createElement('div');
    section.id = `section-${id}`;
    section.dataset['indexScrollTestSection'] = 'true';
    section.dataset['absoluteTop'] = absoluteTop.toString();
    vi.spyOn(section, 'getBoundingClientRect').mockImplementation(() => (
      rectAt(100 + Number(section.dataset['absoluteTop']) - scrollContainer.scrollTop, 40)
    ));
    document.body.appendChild(section);
  }

  function setSectionPosition(id: string, absoluteTop: number): void {
    const section = document.getElementById(`section-${id}`);
    if (!section) throw new Error(`Missing test section ${id}`);
    section.dataset['absoluteTop'] = absoluteTop.toString();
  }

  function triggerResize(): void {
    const resizeObserver = MockResizeObserver.instances[0];
    resizeObserver.callback([], resizeObserver as unknown as ResizeObserver);
  }

  function markerTopPixels(): number[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.scrollbar-marker'),
      marker => Number((Number.parseFloat(marker.style.top) * indexTrack.clientHeight / 100).toFixed(6)),
    );
  }

  function scrollTo(top: number): void {
    scrollContainer.scrollTop = top;
    scrollContainer.dispatchEvent(new Event('scroll'));
  }

  function rectAt(top: number, height: number): DOMRect {
    return {
      bottom: top + height,
      height,
      left: 0,
      right: 16,
      top,
      width: 16,
      x: 0,
      y: top,
      toJSON: () => ({}),
    };
  }
});
