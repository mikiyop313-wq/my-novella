import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const UniqueIdExtension = Extension.create({
  name: 'uniqueId',

  // Higher priority so it runs before other things
  priority: 1000,

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          id: {
            default: null,
            parseHTML: element => element.getAttribute('data-id'),
            renderHTML: attributes => {
              if (!attributes['id']) {
                return {};
              }
              return {
                'data-id': attributes['id'],
              };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('uniqueId'),
        appendTransaction: (transactions, oldState, newState) => {
          // If no changes, do nothing
          if (transactions.length === 0 || !transactions.some(tr => tr.docChanged)) {
            return;
          }

          const tr = newState.tr;
          let modified = false;
          const seenIds = new Set<string>();

          // Iterate through all nodes to check if they need an ID
          newState.doc.descendants((node, pos) => {
            if (node.isText) {
              return false; // Don't descend into text nodes
            }

            // Only add IDs to paragraphs and headings
            if (node.type.name === 'paragraph' || node.type.name === 'heading') {
              const currentId = node.attrs['id'] as string | null;
              if (!currentId || seenIds.has(currentId)) {
                const id = crypto.randomUUID();
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, id });
                seenIds.add(id);
                modified = true;
              } else {
                seenIds.add(currentId);
              }
            }
            return true;
          });

          if (modified) {
            // We set addToHistory to false so we don't break undo/redo
            return tr.setMeta('addToHistory', false);
          }
          return;
        },
      }),
    ];
  },
});
