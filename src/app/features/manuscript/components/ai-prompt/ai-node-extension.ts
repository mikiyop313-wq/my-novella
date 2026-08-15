import { Injector } from '@angular/core';
import { Node, mergeAttributes } from '@tiptap/core';
import { AngularNodeViewRenderer } from 'ngx-tiptap';

import { AiPromptComponent } from './ai-prompt.component';

const parseStringArrayAttribute = (element: HTMLElement, attribute: string): string[] => {
  const rawValue = element.getAttribute(attribute);
  if (!rawValue) return [];

  try {
    const value: unknown = JSON.parse(rawValue);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

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
        },
        reasoningMode: {
          default: false,
          parseHTML: element => element.getAttribute('data-reasoning-mode') === 'true',
          renderHTML: attributes => ({ 'data-reasoning-mode': String(attributes['reasoningMode'] === true) }),
        },
        includeFullOutline: {
          default: false,
          parseHTML: element => element.getAttribute('data-include-full-outline') === 'true',
          renderHTML: attributes => ({ 'data-include-full-outline': String(attributes['includeFullOutline'] === true) }),
        },
        contextSceneIds: {
          default: [],
          parseHTML: element => parseStringArrayAttribute(element, 'data-context-scene-ids'),
          renderHTML: attributes => ({ 'data-context-scene-ids': JSON.stringify(attributes['contextSceneIds'] ?? []) }),
        },
        contextCodexEntryIds: {
          default: [],
          parseHTML: element => parseStringArrayAttribute(element, 'data-context-codex-entry-ids'),
          renderHTML: attributes => ({ 'data-context-codex-entry-ids': JSON.stringify(attributes['contextCodexEntryIds'] ?? []) }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'ai-prompt-node' }];
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
          handler: ({ state, range }) => {
            const { tr } = state;
            const start = state.doc.resolve(range.from);

            tr.replaceWith(start.before(), start.after(), this.type.create());
          },
          undoable: true,
        },
      ];
    },
  });
};
