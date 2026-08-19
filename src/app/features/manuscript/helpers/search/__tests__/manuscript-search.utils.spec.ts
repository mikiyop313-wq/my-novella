import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

import type { ActDto, SceneDto, TiptapJsonDoc } from '../../../../../../../shared/models/manuscript.model';
import {
  mergeLiveSearchMatches,
  searchEditorProse,
  searchManuscriptData,
} from '../manuscript-search.utils';

describe('manuscript search utilities', () => {
  const defaultOptions = { query: 'sea', matchCase: false, wholeWord: false };

  it('searches prose literally in manuscript order without crossing blocks', () => {
    const data = manuscript([
      scene('scene-1', doc(paragraph('Sea sea.'), paragraph('se'), paragraph('a'), paragraph('[sea]'))),
      scene('scene-2', doc(paragraph('Another SEA.'))),
    ]);

    const matches = searchManuscriptData(data, defaultOptions);

    expect(matches.map(match => [match.sceneId, match.blockIndex, match.fromOffset])).toEqual([
      ['scene-1', 0, 0],
      ['scene-1', 0, 4],
      ['scene-1', 3, 1],
      ['scene-2', 0, 8],
    ]);
  });

  it('supports case-sensitive and Unicode-aware whole-word matching', () => {
    const data = manuscript([scene('scene-1', doc(paragraph('Élan élan_2 élan.')))]);

    expect(searchManuscriptData(data, {
      query: 'Élan', matchCase: true, wholeWord: true,
    })).toHaveLength(1);
    expect(searchManuscriptData(data, {
      query: 'élan', matchCase: false, wholeWord: true,
    })).toHaveLength(2);
  });

  it('excludes AI control nodes and searches text nested in prose containers', () => {
    const data = manuscript([scene('scene-1', doc(
      { type: 'aiPrompt', attrs: { promptText: 'sea' } },
      { type: 'aiGeneratedBlock', content: [paragraph('sea')] },
      { type: 'blockquote', content: [paragraph('sea')] },
    ))]);

    expect(searchManuscriptData(data, defaultOptions)).toEqual([expect.objectContaining({
      sceneId: 'scene-1', blockIndex: 0,
    })]);
  });

  it('uses live editor results instead of cached prose for materialized scenes', () => {
    const data = manuscript([
      scene('scene-1', doc(paragraph('cached sea'))),
      scene('scene-2', doc(paragraph('unloaded sea'))),
    ]);
    const editor = editorWithContent('live sea');
    const live = searchEditorProse(editor, defaultOptions);

    const matches = mergeLiveSearchMatches({
      data,
      dataMatches: searchManuscriptData(data, defaultOptions),
      liveResult: live,
    });

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ sceneId: 'scene-1', fromOffset: 5, from: expect.any(Number) });
    expect(matches[1]).toMatchObject({ sceneId: 'scene-2', fromOffset: 9 });
    expect(matches[1].from).toBeUndefined();
    editor.destroy();
  });
});

function manuscript(scenes: SceneDto[]): ActDto[] {
  return [{
    id: 'act-1', title: '', bookId: 'book-1', position: 0, status: 'active', summary: null,
    chapters: [{
      id: 'chapter-1', title: '', actId: 'act-1', position: 0, status: 'active', summary: null, scenes,
    }],
  }];
}

function scene(id: string, prose: TiptapJsonDoc): SceneDto {
  return {
    id, prose, title: '', chapterId: 'chapter-1', position: 0, status: 'active', summary: null,
    wordCount: null, pointOfViewOverride: null, povCharacterIdOverride: null,
  };
}

function doc(...content: any[]): TiptapJsonDoc {
  return { type: 'doc', content };
}

function paragraph(text: string): any {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function editorWithContent(text: string): Editor {
  const structuralNode = (name: string) => Node.create({
    name, group: 'block', atom: true,
    addAttributes: () => ({ id: { default: '' } }),
    renderHTML: ({ HTMLAttributes }) => ['div', HTMLAttributes],
  });
  return new Editor({
    extensions: [
      StarterKit,
      structuralNode('actHeader'),
      structuralNode('chapterHeader'),
      structuralNode('sceneSummary'),
      structuralNode('sceneSkeleton'),
    ],
    content: {
      type: 'doc',
      content: [
        { type: 'actHeader', attrs: { id: 'act-1' } },
        { type: 'chapterHeader', attrs: { id: 'chapter-1' } },
        { type: 'sceneSummary', attrs: { id: 'scene-1' } },
        paragraph(text),
        { type: 'sceneSummary', attrs: { id: 'scene-2' } },
        { type: 'sceneSkeleton', attrs: { id: 'scene-2' } },
      ],
    },
  });
}
