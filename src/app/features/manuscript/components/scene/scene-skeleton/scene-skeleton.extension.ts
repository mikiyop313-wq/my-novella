import { Node, mergeAttributes } from '@tiptap/core';
import { AngularNodeViewRenderer } from 'ngx-tiptap';
import { Injector } from '@angular/core';
import { SceneSkeletonComponent } from './scene-skeleton.component';

/**
 * Tiptap `Node` extension for lazy-loaded scene placeholders.
 *
 * A `sceneSkeleton` node is inserted in place of unloaded scene prose
 * during initial document build (`buildEditorContentLazy`). When the node
 * scrolls into the viewport, `SceneSkeletonComponent` triggers
 * `ManuscriptStore.loadAndPatchScene()` which replaces this node with real
 * paragraph content via a ProseMirror transaction.
 *
 * Properties:
 * - `atom: true`  — the node is treated as an indivisible unit (no cursor
 *                   placement inside it, no partial selection).
 * - `selectable: false` — users cannot select or accidentally delete it
 *                         via keyboard/mouse.
 * - `draggable: false`  — cannot be drag-dropped.
 */
export const SceneSkeletonExtension = (injector: Injector) => {
  return Node.create({
    name: 'sceneSkeleton',
    group: 'block',
    atom: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return {
        sceneId: {
          default: '',
          parseHTML: element => element.getAttribute('data-scene-id') || '',
          renderHTML: attributes => ({ 'data-scene-id': attributes['sceneId'] }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'scene-skeleton' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['scene-skeleton', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
      return AngularNodeViewRenderer(SceneSkeletonComponent, { injector });
    },
  });
};
