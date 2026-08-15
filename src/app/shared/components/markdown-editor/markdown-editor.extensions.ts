import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { defaultHighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  type Extension,
  type Range,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  drawSelection,
  dropCursor,
  keymap,
  placeholder,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

type MarkdownSyntaxNode = ReturnType<typeof syntaxTree>['topNode'];

export interface MarkdownKeywordHighlight {
  startIndex: number;
  endIndex: number;
  entryIds: readonly string[];
}

export interface MarkdownKeywordClick {
  entryIds: readonly string[];
  clientX: number;
  clientY: number;
}

interface MarkdownKeywordState {
  highlights: readonly MarkdownKeywordHighlight[];
  decorations: DecorationSet;
}

const excludedKeywordNodeNames = new Set([
  'CodeBlock',
  'FencedCode',
  'Image',
  'InlineCode',
  'URL',
]);

const strongDecoration = Decoration.mark({ class: 'cm-md-strong' });
const emphasisDecoration = Decoration.mark({ class: 'cm-md-emphasis' });
const strikeDecoration = Decoration.mark({ class: 'cm-md-strike' });
const inlineCodeDecoration = Decoration.mark({ class: 'cm-md-inline-code' });
const linkDecoration = Decoration.mark({ class: 'cm-md-link' });
const codeTextDecoration = Decoration.mark({ class: 'cm-md-code-text' });
const keywordDecoration = Decoration.mark({ class: 'cm-codex-keyword' });

const setMarkdownKeywordHighlights = StateEffect.define<readonly MarkdownKeywordHighlight[]>();

const markdownKeywordField = StateField.define<MarkdownKeywordState>({
  create() {
    return { highlights: [], decorations: Decoration.none };
  },
  update(value, transaction) {
    let highlights = transaction.docChanged
      ? mapKeywordHighlights(value.highlights, transaction)
      : value.highlights;

    for (const effect of transaction.effects) {
      if (effect.is(setMarkdownKeywordHighlights)) highlights = effect.value;
    }

    return buildMarkdownKeywordState(transaction.state, highlights);
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});

class ListMarkerWidget extends WidgetType {
  constructor(private readonly sourceMarker: string) {
    super();
  }

  override eq(other: ListMarkerWidget): boolean {
    return other.sourceMarker === this.sourceMarker;
  }

  override toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = 'cm-md-list-marker';
    marker.textContent = /^\d+[.)]$/.test(this.sourceMarker) ? this.sourceMarker : '•';
    marker.setAttribute('aria-hidden', 'true');
    return marker;
  }
}

class HorizontalRuleWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const rule = document.createElement('span');
    rule.className = 'cm-md-horizontal-rule';
    rule.setAttribute('aria-hidden', 'true');
    return rule;
  }
}

export function createMarkdownExtensions(
  placeholderText: string,
  onKeywordClick?: (event: MarkdownKeywordClick) => void,
): Extension[] {
  return [
    markdown({
      base: markdownLanguage,
      completeHTMLTags: false,
      pasteURLAsLink: false,
    }),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(false),
    EditorView.lineWrapping,
    placeholder(placeholderText),
    markdownLivePreview,
    markdownKeywordField,
    EditorView.domEventHandlers({
      click: (event, view) => handleKeywordClick(event, view, onKeywordClick),
    }),
    keymap.of([
      ...markdownFormattingKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
  ];
}

export function updateMarkdownKeywordHighlights(
  view: EditorView,
  highlights: readonly MarkdownKeywordHighlight[],
): void {
  view.dispatch({ effects: setMarkdownKeywordHighlights.of(highlights) });
}

function buildMarkdownKeywordState(
  state: EditorState,
  highlights: readonly MarkdownKeywordHighlight[],
): MarkdownKeywordState {
  const normalized = normalizeKeywordHighlights(state, highlights);
  return {
    highlights: normalized,
    decorations: Decoration.set(
      normalized.map(highlight => keywordDecoration.range(highlight.startIndex, highlight.endIndex)),
      true,
    ),
  };
}

function normalizeKeywordHighlights(
  state: EditorState,
  highlights: readonly MarkdownKeywordHighlight[],
): MarkdownKeywordHighlight[] {
  const grouped = new Map<string, MarkdownKeywordHighlight>();

  for (const highlight of highlights) {
    if (
      !Number.isInteger(highlight.startIndex)
      || !Number.isInteger(highlight.endIndex)
      || highlight.startIndex < 0
      || highlight.startIndex >= highlight.endIndex
      || highlight.endIndex > state.doc.length
      || isExcludedKeywordRange(state, highlight.startIndex, highlight.endIndex)
    ) {
      continue;
    }

    const entryIds = [...new Set(highlight.entryIds.filter(Boolean))];
    if (entryIds.length === 0) continue;

    const key = `${highlight.startIndex}:${highlight.endIndex}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      startIndex: highlight.startIndex,
      endIndex: highlight.endIndex,
      entryIds: existing
        ? [...new Set([...existing.entryIds, ...entryIds])]
        : entryIds,
    });
  }

  return [...grouped.values()].sort((left, right) =>
    left.startIndex - right.startIndex || left.endIndex - right.endIndex,
  );
}

function isExcludedKeywordRange(state: EditorState, from: number, to: number): boolean {
  let isExcluded = false;

  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (excludedKeywordNodeNames.has(node.name) && from < node.to && to > node.from) {
        isExcluded = true;
        return false;
      }
      return undefined;
    },
  });

  return isExcluded;
}

function mapKeywordHighlights(
  highlights: readonly MarkdownKeywordHighlight[],
  transaction: Transaction,
): MarkdownKeywordHighlight[] {
  return highlights.map(highlight => ({
    ...highlight,
    startIndex: transaction.changes.mapPos(highlight.startIndex, 1),
    endIndex: transaction.changes.mapPos(highlight.endIndex, -1),
  }));
}

function handleKeywordClick(
  event: MouseEvent,
  view: EditorView,
  onKeywordClick?: (event: MarkdownKeywordClick) => void,
): boolean {
  if (
    !onKeywordClick
    || event.button !== 0
    || event.ctrlKey
    || event.metaKey
    || event.altKey
    || event.shiftKey
    || !view.state.selection.ranges.every(range => range.empty)
    || !(event.target instanceof Element)
    || !event.target.closest('.cm-codex-keyword')
  ) {
    return false;
  }

  const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (position === null) return false;

  const keywordState = view.state.field(markdownKeywordField);
  const highlight = keywordState.highlights.find(candidate =>
    position >= candidate.startIndex && position < candidate.endIndex,
  ) ?? keywordState.highlights.find(candidate =>
    position > candidate.startIndex && position <= candidate.endIndex,
  );
  if (!highlight) return false;

  onKeywordClick({
    entryIds: highlight.entryIds,
    clientX: event.clientX,
    clientY: event.clientY,
  });
  return true;
}

export const markdownLivePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildLivePreviewDecorations(view);
  }

  update(update: ViewUpdate): void {
    if (
      update.docChanged
      || update.selectionSet
      || update.focusChanged
      || update.viewportChanged
      || syntaxTree(update.startState) !== syntaxTree(update.state)
    ) {
      this.decorations = buildLivePreviewDecorations(update.view);
    }
  }
}, {
  decorations: plugin => plugin.decorations,
});

export const markdownFormattingKeymap = [
  { key: 'Mod-b', preventDefault: true, run: (view: EditorView) => toggleDelimitedSpan(view, 'StrongEmphasis', '**') },
  { key: 'Mod-i', preventDefault: true, run: (view: EditorView) => toggleDelimitedSpan(view, 'Emphasis', '*') },
  { key: 'Mod-Shift-x', preventDefault: true, run: (view: EditorView) => toggleDelimitedSpan(view, 'Strikethrough', '~~') },
  { key: 'Mod-e', preventDefault: true, run: (view: EditorView) => toggleDelimitedSpan(view, 'InlineCode', '`') },
  { key: 'Mod-k', preventDefault: true, run: toggleLink },
];

export function buildLivePreviewDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const lineClasses = new Map<number, Set<string>>();
  const state = view.state;
  const revealSelection = view.hasFocus;

  syntaxTree(state).iterate({
    enter(nodeRef) {
      const node = nodeRef.node;

      if (node.name === 'Image' || node.name === 'Table') return false;

      switch (node.name) {
        case 'StrongEmphasis':
          decorateInlineSpan(state, node, 'EmphasisMark', strongDecoration, ranges, revealSelection);
          break;
        case 'Emphasis':
          decorateInlineSpan(state, node, 'EmphasisMark', emphasisDecoration, ranges, revealSelection);
          break;
        case 'Strikethrough':
          decorateInlineSpan(state, node, 'StrikethroughMark', strikeDecoration, ranges, revealSelection);
          break;
        case 'InlineCode':
          decorateInlineSpan(state, node, 'CodeMark', inlineCodeDecoration, ranges, revealSelection);
          break;
        case 'Link':
          decorateLink(state, node, ranges, revealSelection);
          break;
        case 'ListItem':
          decorateListItem(state, node, ranges, lineClasses, revealSelection);
          break;
        case 'QuoteMark':
          decorateQuoteMark(state, node, ranges, lineClasses, revealSelection);
          break;
        case 'FencedCode':
          decorateFencedCode(state, node, ranges, lineClasses, revealSelection);
          break;
        case 'HorizontalRule':
          decorateHorizontalRule(state, node, ranges, lineClasses, revealSelection);
          break;
        default:
          if (/^ATXHeading[1-6]$/.test(node.name)) {
            decorateHeading(state, node, ranges, lineClasses, revealSelection);
          } else if (/^SetextHeading[12]$/.test(node.name)) {
            decorateSetextHeading(state, node, ranges, lineClasses, revealSelection);
          }
          break;
      }

      return undefined;
    },
  });

  for (const [lineStart, classes] of lineClasses) {
    ranges.push(Decoration.line({ class: [...classes].join(' ') }).range(lineStart));
  }

  return Decoration.set(ranges, true);
}

function decorateInlineSpan(
  state: EditorState,
  node: MarkdownSyntaxNode,
  markerName: string,
  contentDecoration: Decoration,
  ranges: Range<Decoration>[],
  revealSelection: boolean,
): void {
  const markers = directChildren(node).filter(child => child.name === markerName);
  if (markers.length < 2) return;

  const firstMarker = markers[0];
  const lastMarker = markers[markers.length - 1];
  if (firstMarker.to < lastMarker.from) {
    ranges.push(contentDecoration.range(firstMarker.to, lastMarker.from));
  }

  if (!selectionTouches(state, node.from, node.to, revealSelection)) {
    markers.forEach(marker => ranges.push(hiddenRange(marker.from, marker.to)));
  }
}

function decorateLink(
  state: EditorState,
  node: MarkdownSyntaxNode,
  ranges: Range<Decoration>[],
  revealSelection: boolean,
): void {
  const children = directChildren(node);
  const markers = children.filter(child => child.name === 'LinkMark');
  const url = children.find(child => child.name === 'URL');
  if (markers.length < 4) return;

  const labelFrom = markers[0].to;
  const labelTo = markers[1].from;
  if (labelFrom < labelTo) ranges.push(linkDecoration.range(labelFrom, labelTo));

  if (selectionTouches(state, node.from, node.to, revealSelection)) return;

  markers.forEach(marker => ranges.push(hiddenRange(marker.from, marker.to)));
  if (url) ranges.push(hiddenRange(url.from, url.to));
}

function decorateHeading(
  state: EditorState,
  node: MarkdownSyntaxNode,
  ranges: Range<Decoration>[],
  lineClasses: Map<number, Set<string>>,
  revealSelection: boolean,
): void {
  const level = Number(node.name.slice('ATXHeading'.length));
  const line = state.doc.lineAt(node.from);
  addLineClass(lineClasses, line.from, `cm-md-heading-${level}`);

  if (selectionTouches(state, node.from, node.to, revealSelection)) return;

  const marker = directChildren(node).find(child => child.name === 'HeaderMark');
  if (!marker) return;

  let contentStart = marker.to;
  while (contentStart < node.to && /\s/.test(state.doc.sliceString(contentStart, contentStart + 1))) {
    contentStart++;
  }
  ranges.push(hiddenRange(marker.from, contentStart));
}

function decorateListItem(
  state: EditorState,
  node: MarkdownSyntaxNode,
  ranges: Range<Decoration>[],
  lineClasses: Map<number, Set<string>>,
  revealSelection: boolean,
): void {
  const marker = directChildren(node).find(child => child.name === 'ListMark');
  if (!marker) return;

  addLineClass(lineClasses, state.doc.lineAt(marker.from).from, 'cm-md-list-item');
  if (selectionTouches(state, node.from, node.to, revealSelection)) return;

  ranges.push(Decoration.replace({
    widget: new ListMarkerWidget(state.doc.sliceString(marker.from, marker.to)),
  }).range(marker.from, marker.to));
}

function decorateSetextHeading(
  state: EditorState,
  node: MarkdownSyntaxNode,
  ranges: Range<Decoration>[],
  lineClasses: Map<number, Set<string>>,
  revealSelection: boolean,
): void {
  const level = Number(node.name.slice('SetextHeading'.length));
  addLineClass(lineClasses, state.doc.lineAt(node.from).from, `cm-md-heading-${level}`);
  if (selectionTouches(state, node.from, node.to, revealSelection)) return;

  const marker = directChildren(node).find(child => child.name === 'HeaderMark');
  if (!marker) return;

  ranges.push(hiddenRange(marker.from, marker.to));
  addLineClass(lineClasses, state.doc.lineAt(marker.from).from, 'cm-md-marker-line-hidden');
}

function decorateQuoteMark(
  state: EditorState,
  node: MarkdownSyntaxNode,
  ranges: Range<Decoration>[],
  lineClasses: Map<number, Set<string>>,
  revealSelection: boolean,
): void {
  const blockquote = closestAncestor(node, 'Blockquote');
  addLineClass(lineClasses, state.doc.lineAt(node.from).from, 'cm-md-blockquote');
  if (blockquote && !selectionTouches(state, blockquote.from, blockquote.to, revealSelection)) {
    ranges.push(hiddenRange(node.from, node.to));
  }
}

function decorateFencedCode(
  state: EditorState,
  node: MarkdownSyntaxNode,
  ranges: Range<Decoration>[],
  lineClasses: Map<number, Set<string>>,
  revealSelection: boolean,
): void {
  const children = directChildren(node);
  const codeText = children.find(child => child.name === 'CodeText');
  if (codeText) ranges.push(codeTextDecoration.range(codeText.from, codeText.to));

  for (let lineNumber = state.doc.lineAt(node.from).number; lineNumber <= state.doc.lineAt(node.to).number; lineNumber++) {
    addLineClass(lineClasses, state.doc.line(lineNumber).from, 'cm-md-code-block');
  }

  if (selectionTouches(state, node.from, node.to, revealSelection)) return;

  const markers = children.filter(child => child.name === 'CodeMark' || child.name === 'CodeInfo');
  markers.forEach(marker => ranges.push(hiddenRange(marker.from, marker.to)));
  children
    .filter(child => child.name === 'CodeMark')
    .forEach(marker => addLineClass(lineClasses, state.doc.lineAt(marker.from).from, 'cm-md-code-fence-hidden'));
}

function decorateHorizontalRule(
  state: EditorState,
  node: MarkdownSyntaxNode,
  ranges: Range<Decoration>[],
  lineClasses: Map<number, Set<string>>,
  revealSelection: boolean,
): void {
  const line = state.doc.lineAt(node.from);
  addLineClass(lineClasses, line.from, 'cm-md-horizontal-rule-line');
  if (!selectionTouches(state, node.from, node.to, revealSelection)) {
    ranges.push(Decoration.replace({ widget: new HorizontalRuleWidget() }).range(node.from, node.to));
  }
}

function hiddenRange(from: number, to: number): Range<Decoration> {
  return Decoration.replace({}).range(from, to);
}

function selectionTouches(state: EditorState, from: number, to: number, revealSelection: boolean): boolean {
  if (!revealSelection) return false;

  return state.selection.ranges.some(selection => (
    selection.empty
      ? selection.head >= from && selection.head < to
      : selection.from < to && selection.to > from
  ));
}

function directChildren(node: MarkdownSyntaxNode): MarkdownSyntaxNode[] {
  const children: MarkdownSyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) children.push(child);
  return children;
}

function closestAncestor(node: MarkdownSyntaxNode, name: string): MarkdownSyntaxNode | null {
  for (let current: MarkdownSyntaxNode | null = node.parent; current; current = current.parent) {
    if (current.name === name) return current;
  }
  return null;
}

function addLineClass(classes: Map<number, Set<string>>, lineStart: number, className: string): void {
  const lineClasses = classes.get(lineStart) ?? new Set<string>();
  lineClasses.add(className);
  classes.set(lineStart, lineClasses);
}

function toggleDelimitedSpan(view: EditorView, nodeName: string, delimiter: string): boolean {
  const selection = view.state.selection.main;
  const activeNode = findActiveNode(view.state, selection.head, nodeName);

  if (activeNode && selection.from >= activeNode.from && selection.to <= activeNode.to) {
    const markers = directChildren(activeNode).filter(child => (
      child.name === 'EmphasisMark'
      || child.name === 'StrikethroughMark'
      || child.name === 'CodeMark'
    ));
    if (markers.length >= 2) {
      view.dispatch({
        changes: markers.map(marker => ({ from: marker.from, to: marker.to, insert: '' })),
        annotations: isolateHistory.of('full'),
        scrollIntoView: true,
      });
      return true;
    }
  }

  const selectedText = view.state.sliceDoc(selection.from, selection.to);
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: `${delimiter}${selectedText}${delimiter}` },
    selection: EditorSelection.range(
      selection.from + delimiter.length,
      selection.from + delimiter.length + selectedText.length,
    ),
    annotations: isolateHistory.of('full'),
    scrollIntoView: true,
  });
  return true;
}

function toggleLink(view: EditorView): boolean {
  const selection = view.state.selection.main;
  const activeLink = findActiveNode(view.state, selection.head, 'Link');

  if (activeLink && selection.from >= activeLink.from && selection.to <= activeLink.to) {
    const markers = directChildren(activeLink).filter(child => child.name === 'LinkMark');
    if (markers.length >= 2) {
      const label = view.state.sliceDoc(markers[0].to, markers[1].from);
      view.dispatch({
        changes: { from: activeLink.from, to: activeLink.to, insert: label },
        selection: EditorSelection.cursor(activeLink.from + label.length),
        annotations: isolateHistory.of('full'),
        scrollIntoView: true,
      });
      return true;
    }
  }

  const selectedText = view.state.sliceDoc(selection.from, selection.to);
  const label = selectedText || 'text';
  const inserted = `[${label}](url)`;
  const selectionFrom = selectedText
    ? selection.from + label.length + 3
    : selection.from + 1;
  const selectionTo = selectedText
    ? selectionFrom + 3
    : selectionFrom + label.length;

  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: inserted },
    selection: EditorSelection.range(selectionFrom, selectionTo),
    annotations: isolateHistory.of('full'),
    scrollIntoView: true,
  });
  return true;
}

function findActiveNode(state: EditorState, position: number, nodeName: string): MarkdownSyntaxNode | null {
  let node: MarkdownSyntaxNode | null = syntaxTree(state).resolveInner(position, -1);
  while (node) {
    if (node.name === nodeName) return node;
    node = node.parent;
  }
  return null;
}
