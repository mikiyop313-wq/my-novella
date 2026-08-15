import { Node, mergeAttributes } from '@tiptap/core';
import { AngularNodeViewRenderer } from 'ngx-tiptap';
import { Injector } from '@angular/core';
import { AiGeneratedBlockComponent } from './ai-generated-block.component';

export const AiGeneratedBlockExtension = (injector: Injector) => {
  return Node.create({
    name: 'aiGeneratedBlock',

    group: 'block',
    content: 'block+',
    atom: true,

    draggable: false,

    addAttributes() {
      return {
        id: {
          default: null,
          parseHTML: element => element.getAttribute('data-id') || null,
          renderHTML: attributes => attributes['id'] ? { 'data-id': attributes['id'] } : {},
        },
        sourcePromptId: {
          default: '',
          parseHTML: element => element.getAttribute('data-source-prompt-id') || '',
          renderHTML: attributes => attributes['sourcePromptId']
            ? { 'data-source-prompt-id': attributes['sourcePromptId'] }
            : {},
        },
        promptText: {
          default: '',
          parseHTML: element => element.getAttribute('data-prompt-text') || '',
          renderHTML: attributes => attributes['promptText'] ? { 'data-prompt-text': attributes['promptText'] } : {},
        },
        provider: {
          default: '',
          parseHTML: element => element.getAttribute('data-provider') || '',
          renderHTML: attributes => attributes['provider'] ? { 'data-provider': attributes['provider'] } : {},
        },
        modelId: {
          default: '',
          parseHTML: element => element.getAttribute('data-model-id') || '',
          renderHTML: attributes => attributes['modelId'] ? { 'data-model-id': attributes['modelId'] } : {},
        },
        isGenerating: {
          default: false,
          parseHTML: element => element.getAttribute('data-is-generating') === 'true',
          renderHTML: attributes => attributes['isGenerating'] ? { 'data-is-generating': 'true' } : {},
        },
        reasoningText: {
          default: '',
          parseHTML: element => element.getAttribute('data-reasoning-text') || '',
          renderHTML: attributes => attributes['reasoningText'] ? { 'data-reasoning-text': attributes['reasoningText'] } : {},
        },
        reasoningMode: {
          default: false,
          parseHTML: element => element.getAttribute('data-reasoning-mode') === 'true',
          renderHTML: attributes => attributes['reasoningMode'] ? { 'data-reasoning-mode': 'true' } : {},
        }
      };
    },

    parseHTML() {
      return [
        {
          tag: 'ai-generated-block',
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return ['ai-generated-block', mergeAttributes(HTMLAttributes), 0];
    },

    addNodeView() {
      return AngularNodeViewRenderer(AiGeneratedBlockComponent, { injector });
    },
  });
};
