import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { isHeaderNodeType, isSceneHeaderNodeType } from '../helpers/content/manuscript-node-types';

export const ALLOW_MANUSCRIPT_STRUCTURE_CHANGE_META = 'allowManuscriptStructureChange';

export const ManuscriptEditingGuardExtension = Extension.create({
  name: 'manuscriptEditingGuard',

  priority: 1100,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('manuscriptEditingGuard'),
        filterTransaction: transaction => isAllowedManuscriptTransaction(transaction),
        props: {
          attributes: state => {
            const attributes: Record<string, string> = {};
            if (documentHasScene(state.doc)) return attributes;

            attributes['class'] = 'manuscript-editing-forbidden-root';
            attributes['title'] = 'Create a scene before writing.';
            return attributes;
          },
          decorations: state => forbiddenEditingDecorations(state.doc),
        },
      }),
    ];
  },
});

function documentHasScene(doc: ProseMirrorNode): boolean {
  let hasScene = false;

  doc.forEach(node => {
    if (isSceneHeaderNodeType(node.type.name)) hasScene = true;
  });

  return hasScene;
}

function forbiddenEditingDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  let insideScene = false;

  doc.forEach((node, offset) => {
    if (isSceneHeaderNodeType(node.type.name)) {
      insideScene = true;
    } else if (isHeaderNodeType(node.type.name)) {
      insideScene = false;
    } else if (!insideScene && !node.isAtom) {
      decorations.push(Decoration.node(offset, offset + node.nodeSize, {
        class: 'manuscript-editing-forbidden',
        title: 'Create a scene before writing.',
      }));
    }
  });

  return DecorationSet.create(doc, decorations);
}

export function isPositionInsideSceneProse(doc: ProseMirrorNode, pos: number): boolean {
  return sceneProseRanges(doc).some(range => pos >= range.from && pos <= range.to);
}

function isAllowedManuscriptTransaction(transaction: Transaction): boolean {
  if (!transaction.docChanged) return true;

  if (
    transaction.getMeta(ALLOW_MANUSCRIPT_STRUCTURE_CHANGE_META) ||
    transaction.getMeta('skipSaver') ||
    transaction.getMeta('history$')
  ) {
    return true;
  }

  if (onlyHeaderAttributesChanged(transaction.before, transaction.doc)) return true;

  return transaction.steps.every((step, index) => {
    const before = transaction.docs[index];
    const after = transaction.docs[index + 1] ?? transaction.doc;
    let allowed = true;
    let mappedRange = false;

    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      mappedRange = true;
      if (
        !isRangeInsideSceneProse(before, oldStart, oldEnd) ||
        !isRangeInsideSceneProse(after, newStart, newEnd)
      ) {
        allowed = false;
      }
    });

    if (!mappedRange) {
      const rangeStep = step as typeof step & { from?: number; to?: number; pos?: number };
      if (
        typeof rangeStep.from === 'number' &&
        typeof rangeStep.to === 'number' &&
        !isRangeInsideSceneProse(before, rangeStep.from, rangeStep.to)
      ) {
        allowed = false;
      } else if (
        typeof rangeStep.from !== 'number' &&
        typeof rangeStep.pos === 'number' &&
        !isPositionInsideSceneProse(before, rangeStep.pos)
      ) {
        allowed = false;
      } else if (
        typeof rangeStep.from !== 'number' &&
        typeof rangeStep.pos !== 'number'
      ) {
        allowed = false;
      }
    }

    return allowed;
  });
}

function isRangeInsideSceneProse(doc: ProseMirrorNode, from: number, to: number): boolean {
  return sceneProseRanges(doc).some(range => from >= range.from && to <= range.to);
}

function sceneProseRanges(doc: ProseMirrorNode): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  let sceneStart: number | null = null;

  doc.forEach((node, offset) => {
    if (isSceneHeaderNodeType(node.type.name)) {
      if (sceneStart !== null) ranges.push({ from: sceneStart, to: offset });
      sceneStart = offset + node.nodeSize;
    } else if (isHeaderNodeType(node.type.name)) {
      if (sceneStart !== null) ranges.push({ from: sceneStart, to: offset });
      sceneStart = null;
    }
  });

  if (sceneStart !== null) {
    ranges.push({ from: sceneStart, to: doc.content.size });
  }

  return ranges;
}

function onlyHeaderAttributesChanged(before: ProseMirrorNode, after: ProseMirrorNode): boolean {
  if (before.childCount !== after.childCount) return false;

  let headerChanged = false;

  for (let index = 0; index < before.childCount; index++) {
    const beforeNode = before.child(index);
    const afterNode = after.child(index);

    if (!isHeaderNodeType(beforeNode.type.name)) {
      if (!beforeNode.eq(afterNode)) return false;
    } else {
      if (
        beforeNode.type !== afterNode.type ||
        beforeNode.attrs['id'] !== afterNode.attrs['id'] ||
        !beforeNode.content.eq(afterNode.content)
      ) {
        return false;
      }

      if (!beforeNode.eq(afterNode)) headerChanged = true;
    }
  }

  return headerChanged;
}
