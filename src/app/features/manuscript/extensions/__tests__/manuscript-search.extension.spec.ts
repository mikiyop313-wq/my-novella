import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

import {
  clearManuscriptSearchDecorations,
  ManuscriptSearchExtension,
  setManuscriptSearchDecorations,
} from '../manuscript-search.extension';

describe('ManuscriptSearchExtension', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, ManuscriptSearchExtension],
      content: '<p>sea and sea</p>',
    });
  });

  afterEach(() => editor.destroy());

  it('renders passive and active search decorations and clears them', () => {
    const matches = [
      { sceneId: 'scene-1', blockIndex: 0, fromOffset: 0, toOffset: 3, from: 1, to: 4 },
      { sceneId: 'scene-1', blockIndex: 0, fromOffset: 8, toOffset: 11, from: 9, to: 12 },
    ];

    setManuscriptSearchDecorations({ editor, matches, activeMatch: matches[1] });

    expect(editor.view.dom.querySelectorAll('.search-match')).toHaveLength(2);
    expect(editor.view.dom.querySelectorAll('.search-match-active')).toHaveLength(1);

    clearManuscriptSearchDecorations(editor);
    expect(editor.view.dom.querySelectorAll('.search-match')).toHaveLength(0);
  });
});
