import { countWordsInScene } from './manuscript-content.utils';
import { Editor } from '@tiptap/core';

describe('manuscript-content.utils', () => {
  describe('countWordsInScene', () => {
    it('should return 0 when editor or scene is not found', () => {
      expect(countWordsInScene(undefined, 'non-existent')).toBe(0);
    });

    it('should correctly count words in a scene', () => {
      // Mock the minimal shape of editor.state.doc
      const mockNodes = [
        {
          type: { name: 'actHeader' },
          attrs: { id: 'act-1', title: 'Act 1', position: 0 }
        },
        {
          type: { name: 'chapterHeader' },
          attrs: { id: 'chapter-1', title: 'Chapter 1', position: 0 }
        },
        {
          type: { name: 'sceneSummary' },
          attrs: { id: 'scene-1', title: 'Scene 1', summary: 'A scene summary', position: 0 }
        },
        {
          type: { name: 'paragraph' },
          toJSON() { return { type: 'paragraph', content: [{ type: 'text', text: 'Hello world! This is a test.' }] }; }
        },
        {
          type: { name: 'paragraph' },
          toJSON() { return { type: 'paragraph', content: [{ type: 'text', text: 'Another paragraph here.' }] }; }
        }
      ];

      const mockEditor = {
        state: {
          doc: {
            forEach: (callback: (node: any) => void) => {
              mockNodes.forEach(callback);
            }
          }
        }
      } as unknown as Editor;

      const words = countWordsInScene(mockEditor, 'scene-1');
      // Hello world! This is a test. (6 words)
      // Another paragraph here. (3 words)
      // Total = 9 words
      expect(words).toBe(9);
    });

    it('should return 0 for empty or whitespace-only prose content', () => {
      const mockNodes = [
        {
          type: { name: 'sceneSummary' },
          attrs: { id: 'scene-2', title: 'Scene 2', summary: null, position: 0 }
        },
        {
          type: { name: 'paragraph' },
          toJSON() { return { type: 'paragraph', content: [{ type: 'text', text: '   ' }] }; }
        }
      ];

      const mockEditor = {
        state: {
          doc: {
            forEach: (callback: (node: any) => void) => {
              mockNodes.forEach(callback);
            }
          }
        }
      } as unknown as Editor;

      const words = countWordsInScene(mockEditor, 'scene-2');
      expect(words).toBe(0);
    });
  });
});
