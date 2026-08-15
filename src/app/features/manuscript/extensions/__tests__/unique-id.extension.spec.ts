import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { UniqueIdExtension } from '../unique-id.extension';

describe('UniqueIdExtension', () => {
  let editor: Editor | undefined;

  afterEach(() => editor?.destroy());

  it('assigns a new ID when splitting a paragraph', () => {
    editor = createEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [paragraph('paragraph-1', 'FirstSecond')],
    });
    editor.commands.setTextSelection(6);

    expect(editor.commands.splitBlock()).toBe(true);

    const ids = paragraphIds(editor);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain(null);
  });

  it('repairs duplicate IDs in inserted content', () => {
    editor = createEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [
        paragraph('duplicate-id', 'First'),
        paragraph('duplicate-id', 'Second'),
      ],
    });

    const ids = paragraphIds(editor);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('duplicate-id');
    expect(ids[1]).not.toBe('duplicate-id');
  });
});

function createEditor(): Editor {
  return new Editor({
    extensions: [StarterKit, UniqueIdExtension],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  });
}

function paragraph(id: string, text: string): Record<string, unknown> {
  return {
    type: 'paragraph',
    attrs: { id },
    content: [{ type: 'text', text }],
  };
}

function paragraphIds(editor: Editor): Array<string | null> {
  const ids: Array<string | null> = [];
  editor.state.doc.descendants(node => {
    if (node.type.name === 'paragraph') ids.push(node.attrs['id'] ?? null);
  });
  return ids;
}
