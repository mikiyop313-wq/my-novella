import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dismissSlashCommandMenu,
  selectSlashCommand,
  SlashCommandMenuExtension,
  type SlashCommandMenuAnchor,
} from '../slash-command-menu.extension';

describe('SlashCommandMenuExtension', () => {
  let editor: Editor;
  let onOpen: ReturnType<typeof vi.fn<(anchor: SlashCommandMenuAnchor) => void>>;
  let onClose: ReturnType<typeof vi.fn<() => void>>;
  let onNavigate: ReturnType<typeof vi.fn<(direction: 1 | -1) => void>>;
  let onSelect: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    onOpen = vi.fn<(anchor: SlashCommandMenuAnchor) => void>();
    onClose = vi.fn<() => void>();
    onNavigate = vi.fn<(direction: 1 | -1) => void>();
    onSelect = vi.fn<() => void>();
    editor = createEditor();
    editor.view.coordsAtPos = vi.fn(() => ({ left: 100, right: 100, top: 40, bottom: 60 }));
  });

  afterEach(() => editor?.destroy());

  it('opens for a slash in an empty scene-prose paragraph', () => {
    insertAtSceneParagraph('/');

    expect(onOpen).toHaveBeenLastCalledWith({ left: 100, top: 40, bottom: 60 });
  });

  it('does not open after existing prose or outside a scene', () => {
    insertAtSceneParagraph('Existing /');
    expect(onOpen).not.toHaveBeenCalled();

    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    editor.commands.focus('start');
    editor.commands.insertContent('/');

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('supports keyboard navigation, selection, and dismissal', () => {
    insertAtSceneParagraph('/');

    editor.view.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    editor.view.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    editor.view.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(onNavigate.mock.calls).toEqual([[1], [-1]]);
    expect(onSelect).toHaveBeenCalledOnce();

    editor.view.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(editor.state.doc.lastChild?.textContent).toBe('');
    expect(onClose).toHaveBeenCalled();
  });

  it('removes the slash when more text is typed', () => {
    insertAtSceneParagraph('/');
    editor.commands.insertContent('x');

    expect(editor.state.doc.lastChild?.textContent).toBe('x');
    expect(onClose).toHaveBeenCalled();
  });

  it('replaces the slash paragraph with the existing AI prompt node', () => {
    insertAtSceneParagraph('/');

    expect(selectSlashCommand(editor, 'ai')).toBe(true);
    expect(editor.getJSON().content).toEqual([
      { type: 'sceneSummary' },
      { type: 'aiPrompt' },
      { type: 'paragraph' },
    ]);
  });

  it.each(['chapter', 'act', 'scene'] as const)(
    'keeps the structure unchanged when selecting %s',
    command => {
      insertAtSceneParagraph('/');

      expect(selectSlashCommand(editor, command)).toBe(true);
      expect(editor.getJSON().content).toEqual([
        { type: 'sceneSummary' },
        { type: 'paragraph' },
      ]);
    },
  );

  it('removes the trigger when dismissed externally', () => {
    insertAtSceneParagraph('/');

    expect(dismissSlashCommandMenu(editor)).toBe(true);
    expect(editor.state.doc.lastChild?.textContent).toBe('');
  });

  function createEditor(): Editor {
    return new Editor({
      extensions: [
        StarterKit,
        atomNode('sceneSummary'),
        atomNode('aiPrompt'),
        SlashCommandMenuExtension.configure({ onOpen, onClose, onNavigate, onSelect }),
      ],
      content: {
        type: 'doc',
        content: [
          { type: 'sceneSummary' },
          { type: 'paragraph' },
        ],
      },
    });
  }

  function insertAtSceneParagraph(text: string): void {
    editor.commands.setTextSelection(2);
    editor.commands.insertContent(text);
  }
});

function atomNode(name: string) {
  return Node.create({
    name,
    group: 'block',
    atom: true,
    renderHTML: () => ['div', { 'data-node-type': name }],
  });
}
