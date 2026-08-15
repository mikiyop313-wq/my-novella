import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  effect,
  inject,
} from '@angular/core';

import { buildContextHighlightSegments } from '../../../../../shared/utils/context-highlighter';
import { CodexContextTrieService } from '../services/codex-context-trie.service';
import {
  CodexContextHighlightRegistryService,
  type CodexEntryHighlightRange,
} from './codex-context-highlight-registry.service';
import { CodexMatchChooserService } from './codex-match-chooser.service';

// Text in separate content blocks must never form a single match.
const BLOCK_SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,td,th';
// Form controls and explicitly ignored content are excluded from text scanning.
const EXCLUDED_SELECTOR = [
  'input',
  'textarea',
  'select',
  'option',
  'button',
  'a',
  'script',
  'style',
  '[contenteditable=false]',
  '[data-codex-highlight-ignore]',
].join(',');
// Clickable elements retain their native interactions over highlight actions.
const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'summary',
  '[role=button]',
  '[role=link]',
  '[role=menuitem]',
  '[role=option]',
  '[data-codex-highlight-ignore]',
].join(',');

interface TextSpan {
  node: Text;
  startIndex: number;
  endIndex: number;
}

interface LogicalTextGroup {
  boundary: Node;
  text: string;
  spans: TextSpan[];
}

@Directive({
  standalone: true,
  selector: '[codexContextHighlight]',
})
export class CodexContextHighlightDirective implements AfterViewInit, OnDestroy {
  // Dependencies
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly contextTrie = inject(CodexContextTrieService);
  private readonly registry = inject(CodexContextHighlightRegistryService);
  private readonly chooser = inject(CodexMatchChooserService);
  // Highlight ownership and DOM state
  private readonly rangeOwner = {};
  private readonly initialCursor = this.host.style.cursor;
  // Scan lifecycle
  private selector = '';
  private observer: MutationObserver | null = null;
  private scanFrame: number | null = null;
  private initialized = false;
  private destroyed = false;
  private cursorOverHighlight = false;

  /** Limits scanning to the matching descendants when a selector is provided. */
  @Input()
  set codexContextHighlight(value: string | null | undefined) {
    this.selector = value?.trim() ?? '';
    if (this.initialized) this.scheduleScan();
  }

  constructor() {
    // Re-scan whenever the reactive context index changes.
    effect(() => {
      this.contextTrie.trie();
      if (this.initialized) this.scheduleScan();
    });
  }

  ngAfterViewInit(): void {
    const view = this.host.ownerDocument.defaultView;
    if (!view) return;

    this.initialized = true;
    // DOM edits can invalidate Range objects, so rebuild them on the next frame.
    this.observer = new view.MutationObserver(() => this.scheduleScan());
    this.observer.observe(this.host, { subtree: true, childList: true, characterData: true });
    this.scheduleScan();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.observer = null;

    const view = this.host.ownerDocument.defaultView;
    if (view && this.scanFrame !== null) view.cancelAnimationFrame(this.scanFrame);
    this.scanFrame = null;
    this.setHighlightCursor(false);
    this.registry.clearRanges(this.rangeOwner);
  }

  @HostListener('mousemove', ['$event'])
  handleMouseMove(event: MouseEvent): void {
    const target = event.target;
    const isInteractive = target instanceof Element && !!target.closest(INTERACTIVE_SELECTOR);
    const isHighlight =
      !isInteractive && this.registry.getEntryIdsAtPoint(event.clientX, event.clientY).length > 0;

    this.setHighlightCursor(isHighlight);
  }

  @HostListener('mouseleave')
  handleMouseLeave(): void {
    this.setHighlightCursor(false);
  }

  @HostListener('click', ['$event'])
  handleClick(event: MouseEvent): void {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !(event.target instanceof Element) ||
      event.target.closest(INTERACTIVE_SELECTOR)
    )
      return;

    const selection = this.host.ownerDocument.defaultView?.getSelection();
    if (!selection?.isCollapsed) return;

    const entryIds = [...new Set(this.registry.getEntryIdsAtPoint(event.clientX, event.clientY))];
    if (entryIds.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    this.chooser.open(entryIds, event.clientX, event.clientY);
  }

  private setHighlightCursor(isHighlight: boolean): void {
    if (this.cursorOverHighlight === isHighlight) return;

    this.cursorOverHighlight = isHighlight;
    this.host.style.cursor = isHighlight ? 'pointer' : this.initialCursor;
  }

  private scheduleScan(): void {
    const view = this.host.ownerDocument.defaultView;
    if (this.destroyed || !view || this.scanFrame !== null) return;

    this.scanFrame = view.requestAnimationFrame(() => {
      this.scanFrame = null;
      this.scan();
    });
  }

  private scan(): void {
    const ranges: CodexEntryHighlightRange[] = [];

    for (const root of this.getScanRoots()) {
      for (const group of this.collectTextGroups(root)) {
        const segments = buildContextHighlightSegments(
          group.text,
          this.contextTrie.findMatches(group.text),
        );

        for (const segment of segments) {
          if (!segment.isMatch) continue;

          const range = this.createRange(group, segment.startIndex, segment.endIndex);
          if (!range) continue;

          const entryIds = new Set(segment.matches.map((match) => match.value.entryId));
          for (const entryId of entryIds) ranges.push({ entryId, range: range.cloneRange() });
        }
      }
    }

    this.registry.setRanges(this.rangeOwner, ranges);
  }

  private getScanRoots(): Element[] {
    if (!this.selector) return [this.host];

    try {
      const roots = [...this.host.querySelectorAll(this.selector)];
      return roots.filter((root) => !roots.some((other) => other !== root && other.contains(root)));
    } catch {
      return [];
    }
  }

  private collectTextGroups(root: Element): LogicalTextGroup[] {
    if (root.matches(EXCLUDED_SELECTOR)) return [];

    const groups: LogicalTextGroup[] = [];
    let current: LogicalTextGroup | null = null;

    // Preserve contiguous inline text while keeping block-level content isolated.
    const visit = (node: Node, boundary: Node): void => {
      if (node instanceof Text) {
        if (!node.data) return;
        if (!current || current.boundary !== boundary) {
          current = { boundary, text: '', spans: [] };
          groups.push(current);
        }
        const startIndex = current.text.length;
        current.text += node.data;
        current.spans.push({ node, startIndex, endIndex: current.text.length });
        return;
      }

      if (!(node instanceof Element)) return;
      if (node !== root && node.matches(EXCLUDED_SELECTOR)) {
        current = null;
        return;
      }

      const isBlock = node !== root && node.matches(BLOCK_SELECTOR);
      const childBoundary = isBlock ? node : boundary;
      if (isBlock) current = null;
      for (const child of node.childNodes) visit(child, childBoundary);
      if (isBlock) current = null;
    };

    visit(root, root);
    return groups;
  }

  private createRange(group: LogicalTextGroup, startIndex: number, endIndex: number): Range | null {
    const start = group.spans.find(
      (span) => startIndex >= span.startIndex && startIndex < span.endIndex,
    );
    const end = group.spans.find((span) => endIndex > span.startIndex && endIndex <= span.endIndex);
    if (!start || !end) return null;

    const range = this.host.ownerDocument.createRange();
    range.setStart(start.node, startIndex - start.startIndex);
    range.setEnd(end.node, endIndex - end.startIndex);
    return range;
  }
}
