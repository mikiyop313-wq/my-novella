import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import type { ManuscriptSearchMatch } from '../helpers/search/manuscript-search.utils';

interface ManuscriptSearchDecorationState {
  ranges: Array<{ from: number; to: number }>;
  activeRange: { from: number; to: number } | null;
}

const MANUSCRIPT_SEARCH_META = 'manuscriptSearchDecorations';
const manuscriptSearchPluginKey = new PluginKey<DecorationSet>('manuscriptSearch');

export const ManuscriptSearchExtension = Extension.create({
  name: 'manuscriptSearch',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: manuscriptSearchPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, decorations) {
            const state = transaction.getMeta(MANUSCRIPT_SEARCH_META) as
              | ManuscriptSearchDecorationState
              | undefined;

            if (state) return createDecorations(transaction.doc, state);
            return decorations.map(transaction.mapping, transaction.doc);
          },
        },
        props: {
          decorations: state => manuscriptSearchPluginKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});

export function setManuscriptSearchDecorations({
  editor,
  matches,
  activeMatch,
}: {
  editor: Editor;
  matches: ManuscriptSearchMatch[];
  activeMatch: ManuscriptSearchMatch | null;
}): void {
  const ranges = matches.flatMap(match => (
    typeof match.from === 'number' && typeof match.to === 'number'
      ? [{ from: match.from, to: match.to }]
      : []
  ));
  const activeRange = activeMatch
    && typeof activeMatch.from === 'number'
    && typeof activeMatch.to === 'number'
    ? { from: activeMatch.from, to: activeMatch.to }
    : null;

  editor.view.dispatch(editor.state.tr.setMeta(MANUSCRIPT_SEARCH_META, { ranges, activeRange }));
}

export function clearManuscriptSearchDecorations(editor: Editor): void {
  editor.view.dispatch(editor.state.tr.setMeta(MANUSCRIPT_SEARCH_META, {
    ranges: [],
    activeRange: null,
  } satisfies ManuscriptSearchDecorationState));
}

function createDecorations(
  doc: Parameters<typeof DecorationSet.create>[0],
  state: ManuscriptSearchDecorationState,
): DecorationSet {
  const decorations = state.ranges.map(range => Decoration.inline(range.from, range.to, {
    class: sameRange(range, state.activeRange)
      ? 'manuscript-search-match manuscript-search-match-active'
      : 'manuscript-search-match',
  }));

  return DecorationSet.create(doc, decorations);
}

function sameRange(
  range: { from: number; to: number },
  activeRange: { from: number; to: number } | null,
): boolean {
  return !!activeRange && range.from === activeRange.from && range.to === activeRange.to;
}
