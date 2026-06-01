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

    addAttributes() {
      return {
        id: {
          default: null,
          parseHTML: element => element.getAttribute('data-id') || null,
          renderHTML: attributes => attributes['id'] ? { 'data-id': attributes['id'] } : {},
        },
        promptText: {
          default: '',
          parseHTML: element => element.getAttribute('data-prompt-text') || '',
          renderHTML: attributes => attributes['promptText'] ? { 'data-prompt-text': attributes['promptText'] } : {},
        },
        selectedModel: {
          default: null,
          parseHTML: element => element.getAttribute('data-selected-model') || null,
          renderHTML: attributes => attributes['selectedModel'] ? { 'data-selected-model': attributes['selectedModel'] } : {},
        },
        wordCount: {
          default: 500,
          parseHTML: element => Number(element.getAttribute('data-word-count')) || 500,
          renderHTML: attributes => ({ 'data-word-count': attributes['wordCount'] }),
        },
        pov: {
          default: 'global',
          parseHTML: element => element.getAttribute('data-pov') || 'global',
          renderHTML: attributes => ({ 'data-pov': attributes['pov'] }),
        },
        povCharacter: {
          default: null,
          parseHTML: element => element.getAttribute('data-pov-character') || null,
          renderHTML: attributes => attributes['povCharacter'] ? { 'data-pov-character': attributes['povCharacter'] } : {},
        },
        vectorSearch: {
          default: 'global',
          parseHTML: element => element.getAttribute('data-vector-search') || 'global',
          renderHTML: attributes => ({ 'data-vector-search': attributes['vectorSearch'] }),
        }
      };
    },

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
