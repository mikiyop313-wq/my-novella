import { Node, mergeAttributes } from '@tiptap/core';
import { AngularNodeViewRenderer } from 'ngx-tiptap';
import { Injector } from '@angular/core';
import { ManuscriptHeaderComponent } from './manuscript-header.component';

export const ActHeaderExtension = (injector: Injector) => {
  return Node.create({
    name: 'actHeader',
    group: 'block',
    draggable: false,
    selectable: false,
    atom: true,

    addAttributes() {
      return {
        id: {
          default: '',
          parseHTML: element => element.getAttribute('data-id') || '',
          renderHTML: attributes => ({ 'data-id': attributes['id'] }),
        },
        title: {
          default: '',
          parseHTML: element => element.getAttribute('data-title') || '',
          renderHTML: attributes => ({ 'data-title': attributes['title'] }),
        },
        position: {
          default: 0,
          parseHTML: element => Number(element.getAttribute('data-position')) || 0,
          renderHTML: attributes => ({ 'data-position': attributes['position'] }),
        }
      };
    },

    parseHTML() {
      return [{ tag: 'act-header' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['act-header', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
      return AngularNodeViewRenderer(ManuscriptHeaderComponent, { injector });
    },
  });
};

export const ChapterHeaderExtension = (injector: Injector) => {
  return Node.create({
    name: 'chapterHeader',
    group: 'block',
    draggable: false,
    selectable: false,
    atom: true,

    addAttributes() {
      return {
        id: {
          default: '',
          parseHTML: element => element.getAttribute('data-id') || '',
          renderHTML: attributes => ({ 'data-id': attributes['id'] }),
        },
        title: {
          default: '',
          parseHTML: element => element.getAttribute('data-title') || '',
          renderHTML: attributes => ({ 'data-title': attributes['title'] }),
        },
        position: {
          default: 0,
          parseHTML: element => Number(element.getAttribute('data-position')) || 0,
          renderHTML: attributes => ({ 'data-position': attributes['position'] }),
        }
      };
    },

    parseHTML() {
      return [{ tag: 'chapter-header' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['chapter-header', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
      return AngularNodeViewRenderer(ManuscriptHeaderComponent, { injector });
    },
  });
};
