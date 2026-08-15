import { Node, mergeAttributes } from '@tiptap/core';
import { AngularNodeViewRenderer } from 'ngx-tiptap';
import { Injector } from '@angular/core';
import { AiPromptComponent } from './ai-prompt.component';

export const AiPromptExtension = (injector: Injector) => {
  return Node.create({
    name: 'aiPrompt',

    group: 'block',

    draggable: true,

    atom: true,

    parseHTML() {
      return [
        {
          tag: 'ai-prompt-node',
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return ['ai-prompt-node', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
      return AngularNodeViewRenderer(AiPromptComponent, { injector });
    },

    addInputRules() {
      return [
        {
          find: /^\/ai\s$/,
          handler: ({ state, range, match }) => {
            const { tr } = state;
            const start = range.from;
            const end = range.to;
            tr.replaceWith(start, end, this.type.create());
          },
          undoable: true,
        },
      ];
    },
  });
};
