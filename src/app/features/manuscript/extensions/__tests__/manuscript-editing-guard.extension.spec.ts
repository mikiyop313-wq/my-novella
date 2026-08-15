import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { redo, undo } from '@tiptap/pm/history';

import {
  ALLOW_MANUSCRIPT_STRUCTURE_CHANGE_META,
  ManuscriptEditingGuardExtension,
} from '../manuscript-editing-guard.extension';
import { UniqueIdExtension } from '../unique-id.extension';

describe('ManuscriptEditingGuardExtension', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [
        StarterKit,
        structuralNode('actHeader'),
        structuralNode('chapterHeader'),
        structuralNode('sceneSummary'),
        ManuscriptEditingGuardExtension,
        UniqueIdExtension,
      ],
      content: manuscriptDocument(),
    });
  });

  afterEach(() => editor?.destroy());

  it('blocks typing and formatting outside scene prose', () => {
    const orphanPosition = topLevelPosition('orphan');
    const before = editor.getJSON();

    editor.view.dispatch(editor.state.tr.insertText('Blocked', orphanPosition + 1));
    expect(editor.getJSON()).toEqual(before);

    const bold = editor.schema.marks['bold'].create();
    editor.view.dispatch(editor.state.tr.addMark(orphanPosition + 1, orphanPosition + 7, bold));
    expect(editor.getJSON()).toEqual(before);
  });

  it('shows a forbidden cursor only on non-scene prose blocks', () => {
    const orphan = editor.view.dom.querySelector('[data-id="orphan"]');
    const sceneProse = editor.view.dom.querySelector('[data-id="prose-1"]');

    expect(orphan?.classList.contains('manuscript-editing-forbidden')).toBe(true);
    expect(orphan?.getAttribute('title')).toBe('Create a scene before writing.');
    expect(sceneProse?.classList.contains('manuscript-editing-forbidden')).toBe(false);
    expect(editor.view.dom.classList.contains('manuscript-editing-forbidden-root')).toBe(false);
  });

  it('shows the forbidden cursor on the editor root when no scene exists', () => {
    const firstScene = topLevelPosition('scene-1');
    const tr = editor.state.tr.delete(firstScene, editor.state.doc.content.size);
    tr.setMeta(ALLOW_MANUSCRIPT_STRUCTURE_CHANGE_META, true);
    editor.view.dispatch(tr);

    expect(editor.view.dom.classList.contains('manuscript-editing-forbidden-root')).toBe(true);
    expect(editor.view.dom.getAttribute('title')).toBe('Create a scene before writing.');
  });

  it('allows edits at the beginning and end of scene prose', () => {
    const firstSceneHeader = topLevelPosition('scene-1');
    const secondSceneHeader = topLevelPosition('scene-2');
    const paragraph = editor.schema.nodes['paragraph'].create();

    editor.view.dispatch(editor.state.tr.insert(firstSceneHeader + 1, paragraph));
    expect(editor.state.doc.childCount).toBe(8);

    const shiftedSecondSceneHeader = topLevelPosition('scene-2');
    editor.view.dispatch(editor.state.tr.insert(shiftedSecondSceneHeader, paragraph));
    expect(editor.state.doc.childCount).toBe(9);

    expect(shiftedSecondSceneHeader).toBeGreaterThan(secondSceneHeader);
  });

  it('blocks changes that cross a scene boundary', () => {
    const prosePosition = topLevelPosition('prose-1');
    const secondSceneHeader = topLevelPosition('scene-2');
    const before = editor.getJSON();

    editor.view.dispatch(editor.state.tr.delete(prosePosition + 1, secondSceneHeader + 1));

    expect(editor.getJSON()).toEqual(before);
  });

  it('allows header attribute updates and approved structural changes', () => {
    const actPosition = topLevelPosition('act-1');
    editor.view.dispatch(editor.state.tr.setNodeMarkup(actPosition, undefined, {
      ...editor.state.doc.child(0).attrs,
      title: 'Renamed act',
    }));
    expect(editor.state.doc.child(0).attrs['title']).toBe('Renamed act');

    const tr = editor.state.tr.insert(0, editor.schema.nodes['actHeader'].create({
      id: 'act-0',
      title: 'New act',
    }));
    tr.setMeta(ALLOW_MANUSCRIPT_STRUCTURE_CHANGE_META, true);
    editor.view.dispatch(tr);

    expect(editor.state.doc.child(0).attrs['id']).toBe('act-0');
  });

  it('allows undo and redo for accepted scene edits', () => {
    const prosePosition = topLevelPosition('prose-1');
    editor.view.dispatch(editor.state.tr.insertText('New ', prosePosition + 1));
    expect(editor.state.doc.textContent).toContain('New Scene one');

    undo(editor.state, editor.view.dispatch);
    expect(editor.state.doc.textContent).not.toContain('New Scene one');

    redo(editor.state, editor.view.dispatch);
    expect(editor.state.doc.textContent).toContain('New Scene one');
  });

  function topLevelPosition(id: string): number {
    let position = -1;

    editor.state.doc.forEach((node, offset) => {
      if (node.attrs['id'] === id) position = offset;
    });

    if (position < 0) throw new Error(`Node '${id}' was not found.`);
    return position;
  }
});

function structuralNode(name: string) {
  return Node.create({
    name,
    group: 'block',
    atom: true,
    addAttributes() {
      return {
        id: { default: '' },
        title: { default: '' },
      };
    },
    renderHTML({ HTMLAttributes }) {
      return ['div', HTMLAttributes];
    },
  });
}

function manuscriptDocument() {
  return {
    type: 'doc',
    content: [
      { type: 'actHeader', attrs: { id: 'act-1', title: 'Act' } },
      paragraph('orphan', 'Outside'),
      { type: 'chapterHeader', attrs: { id: 'chapter-1', title: 'Chapter' } },
      { type: 'sceneSummary', attrs: { id: 'scene-1', title: 'Scene one' } },
      paragraph('prose-1', 'Scene one'),
      { type: 'sceneSummary', attrs: { id: 'scene-2', title: 'Scene two' } },
      paragraph('prose-2', 'Scene two'),
    ],
  };
}

function paragraph(id: string, text: string) {
  return {
    type: 'paragraph',
    attrs: { id },
    content: [{ type: 'text', text }],
  };
}
