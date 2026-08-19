import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { isPositionInsideSceneProse } from './manuscript-editing-guard.extension';

export type SlashCommand = 'ai' | 'chapter' | 'act' | 'scene';

export interface SlashCommandMenuAnchor {
  left: number;
  top: number;
  bottom: number;
}

export interface SlashCommandRange {
  triggerFrom: number;
  triggerTo: number;
  blockFrom: number;
  blockTo: number;
}

interface SlashCommandMenuOptions {
  onOpen: (anchor: SlashCommandMenuAnchor) => void;
  onClose: () => void;
  onNavigate: (direction: 1 | -1) => void;
  onSelect: () => void;
}

const slashCommandMenuKey = new PluginKey<SlashCommandRange | null>('slashCommandMenu');
const DISMISS_SLASH_MENU_META = 'dismissSlashCommandMenu';

export const SlashCommandMenuExtension = Extension.create<SlashCommandMenuOptions>({
  name: 'slashCommandMenu',

  addOptions() {
    return {
      onOpen: () => undefined,
      onClose: () => undefined,
      onNavigate: () => undefined,
      onSelect: () => undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin<SlashCommandRange | null>({
        key: slashCommandMenuKey,
        state: {
          init: (_, state) => findSlashCommandRange(state),
          apply: (transaction, _value, _oldState, newState) => {
            if (transaction.getMeta(DISMISS_SLASH_MENU_META)) return null;
            return findSlashCommandRange(newState);
          },
        },
        appendTransaction: (transactions, oldState, newState) => {
          const previousRange = slashCommandMenuKey.getState(oldState);
          const currentRange = slashCommandMenuKey.getState(newState);
          if (!previousRange || currentRange) return null;

          const mappedRange = mapTriggerRange(previousRange, transactions);
          if (newState.doc.textBetween(mappedRange.from, mappedRange.to) !== '/') return null;

          return newState.tr
            .delete(mappedRange.from, mappedRange.to)
            .setMeta(DISMISS_SLASH_MENU_META, true);
        },
        props: {
          handleKeyDown: (view, event) => handleMenuKeyDown({ view, event, options }),
          handleDOMEvents: {
            blur: view => {
              if (!slashCommandMenuKey.getState(view.state)) return false;
              dismissSlashCommandMenuFromView(view);
              return false;
            },
          },
        },
        view: view => ({
          update: updatedView => notifyMenuState(updatedView, options),
          destroy: () => options.onClose(),
        }),
      }),
    ];
  },
});

export function selectSlashCommand(editor: Editor, command: SlashCommand): boolean {
  const range = slashCommandMenuKey.getState(editor.state);
  if (!range) return false;

  const transaction = command === 'ai'
    ? editor.state.tr.replaceWith(
      range.blockFrom,
      range.blockTo,
      editor.schema.nodes['aiPrompt'].create(),
    )
    : editor.state.tr.delete(range.triggerFrom, range.triggerTo);

  editor.view.dispatch(transaction.setMeta(DISMISS_SLASH_MENU_META, true));
  editor.commands.focus();
  return true;
}

export function getSlashCommandRange(editor: Editor): SlashCommandRange | null {
  return slashCommandMenuKey.getState(editor.state) ?? null;
}

export function completeStructureSlashCommand(editor: Editor, transaction: Transaction): void {
  editor.view.dispatch(transaction.setMeta(DISMISS_SLASH_MENU_META, true));
  editor.commands.focus();
}

export function dismissSlashCommandMenu(editor: Editor): boolean {
  const range = slashCommandMenuKey.getState(editor.state);
  if (!range) return false;

  editor.view.dispatch(
    editor.state.tr
      .delete(range.triggerFrom, range.triggerTo)
      .setMeta(DISMISS_SLASH_MENU_META, true),
  );
  return true;
}

function findSlashCommandRange(state: EditorState): SlashCommandRange | null {
  const { selection } = state;
  if (!selection.empty || selection.$from.parent.type.name !== 'paragraph') return null;
  if (selection.$from.parentOffset !== 1 || selection.$from.parent.textContent !== '/') return null;
  if (!isPositionInsideSceneProse(state.doc, selection.from)) return null;

  return {
    triggerFrom: selection.from - 1,
    triggerTo: selection.from,
    blockFrom: selection.$from.before(),
    blockTo: selection.$from.after(),
  };
}

function handleMenuKeyDown({
  view,
  event,
  options,
}: {
  view: EditorView;
  event: KeyboardEvent;
  options: SlashCommandMenuOptions;
}): boolean {
  if (!slashCommandMenuKey.getState(view.state)) return false;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    options.onNavigate(event.key === 'ArrowDown' ? 1 : -1);
    return true;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    options.onSelect();
    return true;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    dismissSlashCommandMenuFromView(view);
    return true;
  }

  return false;
}

function dismissSlashCommandMenuFromView(view: EditorView): void {
  const range = slashCommandMenuKey.getState(view.state);
  if (!range) return;

  view.dispatch(
    view.state.tr
      .delete(range.triggerFrom, range.triggerTo)
      .setMeta(DISMISS_SLASH_MENU_META, true),
  );
}

function notifyMenuState(view: EditorView, options: SlashCommandMenuOptions): void {
  const range = slashCommandMenuKey.getState(view.state);
  if (!range) {
    options.onClose();
    return;
  }

  const coordinates = view.coordsAtPos(range.triggerTo);
  options.onOpen({
    left: coordinates.left,
    top: coordinates.top,
    bottom: coordinates.bottom,
  });
}

function mapTriggerRange(
  range: SlashCommandRange,
  transactions: readonly Transaction[],
): { from: number; to: number } {
  let from = range.triggerFrom;
  let to = range.triggerTo;

  for (const transaction of transactions) {
    from = transaction.mapping.map(from, 1);
    to = transaction.mapping.map(to, -1);
  }

  return { from, to };
}
