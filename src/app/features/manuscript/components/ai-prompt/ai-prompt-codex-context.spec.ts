import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { CodexEntryDto, CodexTrackingSetting } from '../../../../../../shared/models/codex.model';
import {
  findDetectedCodexEntryIdsAbovePrompt,
  getAutomaticallyIncludedCodexEntryIds,
  removeAutomaticallyIncludedCodexEntryIds,
} from './ai-prompt-codex-context';

describe('AI prompt Codex context', () => {
  it('detects names and aliases only in text blocks above the prompt in the current scene', () => {
    const doc = createDoc([
      sceneSummary(),
      paragraph('Previous Hero'),
      sceneSummary(),
      paragraph('Mara ', bold('Vale')),
      paragraph('Silver'),
      paragraph('Key'),
      aiPrompt(),
      paragraph('Future Villain'),
    ]);

    expect(findDetectedCodexEntryIdsAbovePrompt(doc, findNodePos(doc, 'aiPrompt'), findMatches)).toEqual(
      new Set(['mara']),
    );
  });

  it('does not reuse a previous scene after an act or chapter boundary', () => {
    const doc = createDoc([
      sceneSummary(),
      paragraph('Mara Vale'),
      chapterHeader(),
      aiPrompt(),
    ]);

    expect(findDetectedCodexEntryIdsAbovePrompt(doc, findNodePos(doc, 'aiPrompt'), findMatches).size).toBe(0);
  });

  it('applies only the automatic tracking modes and removes their persisted selections', () => {
    const entries = [
      createEntry('always', 'always_include'),
      createEntry('detected', 'include_when_detected'),
      createEntry('not-detected', 'include_when_detected'),
      createEntry('manual', 'manual'),
      createEntry('never', 'never_include'),
      createEntry('archived', 'always_include', 'archived'),
    ];

    const automatic = getAutomaticallyIncludedCodexEntryIds(entries, new Set(['detected', 'manual', 'never']));

    expect(automatic).toEqual(new Set(['always', 'detected']));
    expect(removeAutomaticallyIncludedCodexEntryIds(
      ['always', 'detected', 'manual', 'never'],
      automatic,
    )).toEqual(['manual', 'never']);
  });
});

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    sceneSummary: { group: 'block', atom: true },
    chapterHeader: { group: 'block', atom: true },
    aiPrompt: { group: 'block', atom: true },
  },
  marks: {
    bold: {},
  },
});

function createDoc(content: ProseMirrorNode[]): ProseMirrorNode {
  return schema.node('doc', null, content);
}

function paragraph(...content: Array<string | ProseMirrorNode>): ProseMirrorNode {
  return schema.node(
    'paragraph',
    null,
    content.map(item => typeof item === 'string' ? schema.text(item) : item),
  );
}

function bold(text: string): ProseMirrorNode {
  return schema.text(text, [schema.mark('bold')]);
}

function sceneSummary(): ProseMirrorNode {
  return schema.node('sceneSummary');
}

function chapterHeader(): ProseMirrorNode {
  return schema.node('chapterHeader');
}

function aiPrompt(): ProseMirrorNode {
  return schema.node('aiPrompt');
}

function findNodePos(doc: ProseMirrorNode, nodeName: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (node.type.name !== nodeName) return true;
    found = pos;
    return false;
  });
  return found;
}

function findMatches(text: string): Array<{ value: { entryId: string } }> {
  const terms = [
    { text: 'Mara Vale', entryId: 'mara' },
    { text: 'Previous Hero', entryId: 'previous' },
    { text: 'Silver Key', entryId: 'silver-key' },
    { text: 'Future Villain', entryId: 'future' },
  ];

  return terms
    .filter(term => text.toLocaleLowerCase().includes(term.text.toLocaleLowerCase()))
    .map(term => ({ value: { entryId: term.entryId } }));
}

function createEntry(
  id: string,
  trackingSetting: CodexTrackingSetting,
  status: CodexEntryDto['status'] = 'active',
): CodexEntryDto {
  return {
    id,
    bookId: 'book-1',
    type: 'character',
    name: id,
    alias: null,
    description: null,
    image: null,
    status,
    trackingSetting,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
  };
}
