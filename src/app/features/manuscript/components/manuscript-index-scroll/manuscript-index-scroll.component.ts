import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { ManuscriptStore } from '../../store/manuscript.store';

const ACTIVE_SECTION_OFFSET_PX = 20;
const BOTTOM_SCROLL_TOLERANCE_PX = 1;
const LAYOUT_UPDATE_DELAY_MS = 100;
const MINIMUM_MARKER_GAP_PX = 8;

export interface ManuscriptIndexItem {
  id: string;
  label: string;
  type: 'act' | 'chapter' | 'scene';
}

interface PositionedItem {
  item: ManuscriptIndexItem;
  topPercent: number;
}

interface SectionOffset {
  id: string;
  type: ManuscriptIndexItem['type'];
  absoluteTop: number;
}

interface MarkerPosition {
  id: string;
  topPx: number;
}

interface SpaceMarkerPositionsRequest {
  positions: MarkerPosition[];
  trackHeight: number;
}

function spaceMarkerPositions({
  positions,
  trackHeight,
}: SpaceMarkerPositionsRequest): MarkerPosition[] {
  if (positions.length < 2) return positions;

  const effectiveGap = Math.min(
    MINIMUM_MARKER_GAP_PX,
    trackHeight / (positions.length - 1),
  );
  const adjustedPositions = positions.map(position => ({ ...position }));

  for (let index = 1; index < adjustedPositions.length; index++) {
    const previousTop = adjustedPositions[index - 1].topPx;
    adjustedPositions[index].topPx = Math.max(
      adjustedPositions[index].topPx,
      previousTop + effectiveGap,
    );
  }

  const lastIndex = adjustedPositions.length - 1;
  if (adjustedPositions[lastIndex].topPx <= trackHeight) return adjustedPositions;

  adjustedPositions[lastIndex].topPx = trackHeight;
  for (let index = lastIndex - 1; index >= 0; index--) {
    adjustedPositions[index].topPx = Math.min(
      adjustedPositions[index].topPx,
      adjustedPositions[index + 1].topPx - effectiveGap,
    );
  }

  return adjustedPositions;
}

@Component({
  selector: 'app-manuscript-index-scroll',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manuscript-index-scroll.component.html',
  styleUrl: './manuscript-index-scroll.component.scss'
})
export class ManuscriptIndexScrollComponent implements OnDestroy {
  items = input.required<ManuscriptIndexItem[]>();
  select = output<ManuscriptIndexItem>();

  private readonly markerPositions = signal<ReadonlyMap<string, number>>(new Map());
  readonly positionedItems = computed<PositionedItem[]>(() => {
    const positions = this.markerPositions();

    return this.items().flatMap(item => {
      const topPercent = positions.get(item.id);
      return topPercent === undefined ? [] : [{ item, topPercent }];
    });
  });
  store = inject(ManuscriptStore);

  thumbTop = signal<number>(0);
  thumbHeight = signal<number>(0);
  isDragging = signal(false);

  private resizeObserver: ResizeObserver | null = null;
  private scrollContainer: HTMLElement | null = null;
  private trackElement: HTMLElement | null = null;
  private scrollListener: (() => void) | null = null;
  private layoutUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  private sectionOffsets: SectionOffset[] = [];
  private itemStructureKey = '';
  private dragStartY = 0;
  private dragStartScrollTop = 0;

  constructor(
    private ngZone: NgZone,
    private elementRef: ElementRef<HTMLElement>,
  ) {
    effect(() => {
      const currentItems = this.items();
      const structureKey = currentItems.map(item => `${item.type}:${item.id}`).join('|');
      if (structureKey === this.itemStructureKey) return;

      this.itemStructureKey = structureKey;
      this.scheduleLayoutUpdate();
    });
  }

  onItemClick(item: ManuscriptIndexItem) {
    this.store.setActiveSection(item.type, item.id);
    this.select.emit(item);
  }

  onTrackPointerDown(event: PointerEvent) {
    if (!this.scrollContainer) return;

    const target = event.target as HTMLElement;
    if (target.closest('.scrollbar-marker') || target.closest('.scrollbar-thumb')) return;

    const track = event.currentTarget as HTMLElement;
    const trackRect = track.getBoundingClientRect();
    const pointerOffset = event.clientY - trackRect.top;
    const scrollTop = (pointerOffset / trackRect.height) * this.scrollContainer.scrollHeight
      - this.scrollContainer.clientHeight / 2;

    this.scrollContainer.scrollTo({ top: scrollTop, behavior: 'smooth' });
  }

  onThumbPointerDown(event: PointerEvent) {
    if (!this.scrollContainer) return;

    event.preventDefault();
    event.stopPropagation();

    this.dragStartY = event.clientY;
    this.dragStartScrollTop = this.scrollContainer.scrollTop;
    this.isDragging.set(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onThumbPointerMove(event: PointerEvent) {
    if (!this.isDragging() || !this.scrollContainer) return;

    const track = (event.currentTarget as HTMLElement).parentElement;
    if (!track || track.clientHeight === 0) return;

    const scrollDelta = (event.clientY - this.dragStartY)
      * this.scrollContainer.scrollHeight / track.clientHeight;
    this.scrollContainer.scrollTop = this.dragStartScrollTop + scrollDelta;
  }

  onThumbPointerUp(event: PointerEvent) {
    if (!this.isDragging()) return;

    this.isDragging.set(false);
    const thumb = event.currentTarget as HTMLElement;
    if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
  }

  isActive(item: ManuscriptIndexItem): boolean {
    const activeId = this.store.activeSectionId();
    if (activeId === item.id) return true;

    // Also highlight ancestor chapter and act when a deeper item is active
    const { actId, chapterId } = this.store.activeAncestors();
    if (item.type === 'chapter' && chapterId === item.id) return true;
    if (item.type === 'act' && actId === item.id) return true;

    return false;
  }

  private setupTracking(): void {
    if (this.scrollContainer) return;

    const scrollContainer = document.querySelector<HTMLElement>('.editor-content-wrapper');
    const trackElement = this.elementRef.nativeElement.querySelector<HTMLElement>('.scrollbar-track');
    if (!scrollContainer || !trackElement) return;

    this.scrollContainer = scrollContainer;
    this.trackElement = trackElement;

    this.scrollListener = () => {
      this.updateThumbPosition();
      this.updateActiveSection();
    };
    this.scrollContainer.addEventListener('scroll', this.scrollListener, { passive: true });

    this.resizeObserver = new ResizeObserver(() => {
      this.ngZone.run(() => {
        this.calculatePositions();
        this.updateThumbPosition();
      });
    });

    const tiptapEl = this.scrollContainer.querySelector('.tiptap');
    if (tiptapEl) this.resizeObserver.observe(tiptapEl);
    this.resizeObserver.observe(this.scrollContainer);
    this.resizeObserver.observe(this.trackElement);
  }

  private scheduleLayoutUpdate(): void {
    if (this.layoutUpdateTimeout !== null) clearTimeout(this.layoutUpdateTimeout);

    this.layoutUpdateTimeout = setTimeout(() => {
      this.layoutUpdateTimeout = null;
      this.setupTracking();
      this.calculatePositions();
      this.updateThumbPosition();
    }, LAYOUT_UPDATE_DELAY_MS);
  }

  private calculatePositions(): void {
    if (!this.scrollContainer) return;

    const scrollHeight = this.scrollContainer.scrollHeight;
    const trackHeight = this.trackElement?.clientHeight ?? 0;
    if (scrollHeight === 0 || trackHeight === 0) return;

    const currentItems = this.items();
    const rawMarkerPositions: MarkerPosition[] = [];
    const newSectionOffsets: SectionOffset[] = [];

    const containerTop = this.scrollContainer.getBoundingClientRect().top;
    const scrollTop = this.scrollContainer.scrollTop;

    for (const item of currentItems) {
      const el = document.getElementById(`section-${item.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const absoluteTop = rect.top - containerTop + scrollTop;
        const topPx = Math.max(0, Math.min(trackHeight, (absoluteTop / scrollHeight) * trackHeight));

        rawMarkerPositions.push({ id: item.id, topPx });
        newSectionOffsets.push({ id: item.id, type: item.type, absoluteTop });
      }
    }

    const newMarkerPositions = new Map(
      spaceMarkerPositions({ positions: rawMarkerPositions, trackHeight })
        .map(position => [position.id, (position.topPx / trackHeight) * 100]),
    );

    this.sectionOffsets = newSectionOffsets;
    this.markerPositions.set(newMarkerPositions);
    this.updateActiveSection();
  }

  private updateActiveSection(): void {
    if (!this.scrollContainer || this.sectionOffsets.length === 0) return;

    const scrollTop = this.scrollContainer.scrollTop;
    const maximumScrollTop = Math.max(
      0,
      this.scrollContainer.scrollHeight - this.scrollContainer.clientHeight,
    );
    const isAtBottom = maximumScrollTop > 0
      && scrollTop >= maximumScrollTop - BOTTOM_SCROLL_TOLERANCE_PX;

    let activeSection = this.sectionOffsets[0];

    if (isAtBottom) {
      activeSection = this.sectionOffsets[this.sectionOffsets.length - 1];
    } else {
      const activeOffset = scrollTop + ACTIVE_SECTION_OFFSET_PX;
      for (const section of this.sectionOffsets) {
        if (section.absoluteTop <= activeOffset) activeSection = section;
      }
    }

    if (this.store.activeSectionId() === activeSection.id) return;
    this.store.setActiveSection(activeSection.type, activeSection.id);
  }

  private updateThumbPosition(): void {
    if (!this.scrollContainer) return;

    const scrollTop = this.scrollContainer.scrollTop;
    const scrollHeight = this.scrollContainer.scrollHeight;
    const clientHeight = this.scrollContainer.clientHeight;

    if (scrollHeight === 0) return;

    const thumbHeightPct = (clientHeight / scrollHeight) * 100;
    const thumbTopPct = (scrollTop / scrollHeight) * 100;

    this.thumbHeight.set(Math.min(100, Math.max(2, thumbHeightPct)));
    this.thumbTop.set(Math.min(100 - this.thumbHeight(), Math.max(0, thumbTopPct)));
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.scrollContainer && this.scrollListener) {
      this.scrollContainer.removeEventListener('scroll', this.scrollListener);
    }
    if (this.layoutUpdateTimeout !== null) clearTimeout(this.layoutUpdateTimeout);
  }
}
