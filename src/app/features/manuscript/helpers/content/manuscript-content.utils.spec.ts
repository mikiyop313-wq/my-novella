import type { Editor } from '@tiptap/core';
import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model';

import {
  countWordsInScene,
  extractManuscriptHierarchyById,
} from './manuscript-content.utils';

describe('manuscript-content.utils', () => {
  describe('extractManuscriptHierarchyById', () => {
    it('extracts a complete book hierarchy by book ID', () => {
      const hierarchy = extractManuscriptHierarchyById(editorFor(manuscriptDoc()), 'book-1');

      expect(hierarchy?.map(act => act.id)).toEqual(['act-1', 'act-2']);
      expect(hierarchy?.[0].bookId).toBe('book-1');
      expect(hierarchy?.[0].chapters?.[0].actId).toBe('act-1');
      expect(hierarchy?.[0].chapters?.[0].scenes?.[0].chapterId).toBe('chapter-1');
    });

    it('prunes act, chapter, and scene targets while preserving their ancestors', () => {
      const editor = editorFor(manuscriptDoc());

      const act = extractManuscriptHierarchyById(editor, 'act-1');
      expect(act?.map(item => item.id)).toEqual(['act-1']);
      expect(act?.[0].chapters?.map(chapter => chapter.id)).toEqual(['chapter-1', 'chapter-2']);

      const chapter = extractManuscriptHierarchyById(editor, 'chapter-1');
      expect(chapter?.map(item => item.id)).toEqual(['act-1']);
      expect(chapter?.[0].chapters?.map(item => item.id)).toEqual(['chapter-1']);
      expect(chapter?.[0].chapters?.[0].scenes?.map(scene => scene.id)).toEqual(['scene-1', 'scene-2']);

      const scene = extractManuscriptHierarchyById(editor, 'scene-1');
      expect(scene?.map(item => item.id)).toEqual(['act-1']);
      expect(scene?.[0].chapters?.map(item => item.id)).toEqual(['chapter-1']);
      expect(scene?.[0].chapters?.[0].scenes?.map(item => item.id)).toEqual(['scene-1']);
    });

    it('extracts scene prose strictly before the requested AI prompt', () => {
      const scene = extractManuscriptHierarchyById(
        editorFor(manuscriptDoc()),
        'scene-1',
        'prompt-1',
      )?.[0].chapters?.[0].scenes?.[0];

      expect(scene?.prose?.content).toEqual([
        { type: 'paragraph', content: [{ type: 'text', text: 'Before prompt.' }] },
      ]);
    });

    it('returns null when a prompt is missing, belongs to another scene, or targets a non-scene', () => {
      const editor = editorFor(manuscriptDoc());

      expect(extractManuscriptHierarchyById(editor, 'scene-1', 'missing')).toBeNull();
      expect(extractManuscriptHierarchyById(editor, 'scene-1', 'prompt-3')).toBeNull();
      expect(extractManuscriptHierarchyById(editor, 'chapter-1', 'prompt-1')).toBeNull();
    });

    it('distinguishes unloaded skeletons from loaded empty scenes', () => {
      const editor = editorFor(manuscriptDoc());
      const unloaded = extractManuscriptHierarchyById(editor, 'scene-2')
        ?.[0].chapters?.[0].scenes?.[0];
      const empty = extractManuscriptHierarchyById(editor, 'scene-3')
        ?.[0].chapters?.[0].scenes?.[0];

      expect(unloaded?.prose).toBeNull();
      expect(empty?.prose).toEqual({ type: 'doc', content: [] });
    });

    it('uses stored parent IDs in standalone chapter and scene documents', () => {
      const chapterDoc = schema.node('doc', null, [
        chapterHeader('chapter-1', 'act-1'),
        sceneSummary('scene-1', 'chapter-1'),
      ]);
      const chapter = extractManuscriptHierarchyById(editorFor(chapterDoc), 'chapter-1');
      expect(chapter?.[0].id).toBe('act-1');
      expect(chapter?.[0].chapters?.[0].actId).toBe('act-1');

      const sceneDoc = schema.node('doc', null, [sceneSummary('scene-1', 'chapter-1')]);
      const scene = extractManuscriptHierarchyById(editorFor(sceneDoc), 'scene-1');
      expect(scene?.[0].chapters?.[0].id).toBe('chapter-1');
      expect(scene?.[0].chapters?.[0].scenes?.[0].chapterId).toBe('chapter-1');
    });
  });

  describe('countWordsInScene', () => {
    it('returns zero when the editor or scene is missing', () => {
      expect(countWordsInScene(undefined, 'scene-1')).toBe(0);
      expect(countWordsInScene(editorFor(manuscriptDoc()), 'missing')).toBe(0);
    });

    it('counts words from the extracted scene prose', () => {
      expect(countWordsInScene(editorFor(manuscriptDoc()), 'scene-1')).toBe(4);
    });
  });
});

const schema = new Schema({
  nodes: {
    doc: { content: 'block*' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*' },
    actHeader: {
      group: 'block',
      atom: true,
      attrs: structuralAttrs(['id', 'bookId', 'title', 'position']),
    },
    chapterHeader: {
      group: 'block',
      atom: true,
      attrs: structuralAttrs(['id', 'actId', 'title', 'position']),
    },
    sceneSummary: {
      group: 'block',
      atom: true,
      attrs: structuralAttrs(['id', 'chapterId', 'title', 'summary', 'position']),
    },
    sceneSkeleton: { group: 'block', atom: true },
    aiPrompt: { group: 'block', atom: true, attrs: structuralAttrs(['id']) },
  },
});

function manuscriptDoc(): ProseMirrorNode {
  return schema.node('doc', null, [
    actHeader('act-1', 'book-1'),
    chapterHeader('chapter-1', 'act-1'),
    sceneSummary('scene-1', 'chapter-1'),
    paragraph('Before prompt.'),
    schema.node('aiPrompt', { id: 'prompt-1' }),
    paragraph('After prompt.'),
    sceneSummary('scene-2', 'chapter-1'),
    schema.node('sceneSkeleton'),
    chapterHeader('chapter-2', 'act-1'),
    sceneSummary('scene-3', 'chapter-2'),
    actHeader('act-2', 'book-1'),
    chapterHeader('chapter-3', 'act-2'),
    sceneSummary('scene-4', 'chapter-3'),
    schema.node('aiPrompt', { id: 'prompt-3' }),
  ]);
}

function editorFor(doc: ProseMirrorNode): Editor {
  return { state: { doc } } as Editor;
}

function actHeader(id: string, bookId: string): ProseMirrorNode {
  return schema.node('actHeader', { id, bookId, title: id, position: 0 });
}

function chapterHeader(id: string, actId: string): ProseMirrorNode {
  return schema.node('chapterHeader', { id, actId, title: id, position: 0 });
}

function sceneSummary(id: string, chapterId: string): ProseMirrorNode {
  return schema.node('sceneSummary', { id, chapterId, title: id, summary: '', position: 0 });
}

function paragraph(text: string): ProseMirrorNode {
  return schema.node('paragraph', null, schema.text(text));
}

function structuralAttrs(names: readonly string[]): Record<string, { default: string | number }> {
  return Object.fromEntries(names.map(name => [name, { default: name === 'position' ? 0 : '' }]));
}
