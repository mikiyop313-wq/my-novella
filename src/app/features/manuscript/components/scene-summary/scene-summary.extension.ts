import { Node, mergeAttributes } from '@tiptap/core';
import { AngularNodeViewRenderer } from 'ngx-tiptap';
import { Injector } from '@angular/core';
import { SceneSummaryComponent } from './scene-summary.component';

export const SceneSummaryExtension = (injector: Injector) => {
  return Node.create({
    name: 'sceneSummary',
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
        summary: {
          default: '',
          parseHTML: element => element.getAttribute('data-summary') || '',
          renderHTML: attributes => ({ 'data-summary': attributes['summary'] }),
        }
      };
    },

    parseHTML() {
      return [{ tag: 'scene-summary' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['scene-summary', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
      return AngularNodeViewRenderer(SceneSummaryComponent, { injector });
    },
  });
};
