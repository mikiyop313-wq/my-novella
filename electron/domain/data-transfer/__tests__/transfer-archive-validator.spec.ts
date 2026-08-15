import { describe, expect, it } from 'vitest';

import { validateTransferArchive } from '../transfer-archive-validator';
import { completeSnapshot, emptyLibrarySnapshot } from './data-transfer.fixture';

describe('transfer archive validator', () => {
  it('accepts a complete book snapshot and an empty library snapshot', () => {
    const book = completeSnapshot();
    const library = emptyLibrarySnapshot();

    expect(validateTransferArchive(book)).toBe(book);
    expect(validateTransferArchive(library)).toBe(library);
  });

  it('rejects unknown and missing fields', () => {
    const extra = completeSnapshot() as unknown as Record<string, unknown>;
    extra['unexpected'] = true;
    const missing = structuredClone(completeSnapshot()) as unknown as Record<string, unknown>;
    delete (missing['data'] as Record<string, unknown>)['scenes'];

    expect(() => validateTransferArchive(extra)).toThrow('$.unexpected: unexpected field');
    expect(() => validateTransferArchive(missing)).toThrow('$.data.scenes: missing field');
  });

  it.each([
    ['schema version', (snapshot: any) => (snapshot.schemaVersion = 2), '$.schemaVersion'],
    ['timestamp', (snapshot: any) => (snapshot.exportedAt = 'yesterday'), '$.exportedAt'],
    [
      'base64',
      (snapshot: any) => (snapshot.data.books[0].coverImage = 'not base64'),
      '$.data.books[0].coverImage',
    ],
    [
      'enum',
      (snapshot: any) => (snapshot.data.books[0].status = 'published'),
      '$.data.books[0].status',
    ],
    [
      'number',
      (snapshot: any) => (snapshot.data.scenes[0].position = 0.5),
      '$.data.scenes[0].position',
    ],
  ])('rejects an invalid %s', (_, mutate, expectedPath) => {
    const snapshot = structuredClone(completeSnapshot());
    mutate(snapshot);

    expect(() => validateTransferArchive(snapshot)).toThrow(expectedPath);
  });

  it('rejects duplicate identifiers and a mismatched book scope', () => {
    const duplicate = structuredClone(completeSnapshot());
    duplicate.data.acts.push({ ...duplicate.data.acts[0] });
    const wrongScope = structuredClone(completeSnapshot());
    wrongScope.scope = { type: 'book', bookId: 'another-book' };

    expect(() => validateTransferArchive(duplicate)).toThrow('$.data.acts[1]: duplicate key');
    expect(() => validateTransferArchive(wrongScope)).toThrow(
      '$.data.books: book scope must contain exactly the declared book',
    );
  });

  it('rejects dangling and invalid narrative relationships', () => {
    const dangling = structuredClone(completeSnapshot());
    dangling.data.codexEntryNotes[0].codexEntryId = 'missing';
    const inactiveParent = structuredClone(completeSnapshot());
    inactiveParent.data.acts[0].status = 'archived';

    expect(() => validateTransferArchive(dangling)).toThrow(
      '$.data.codexEntryNotes[0].codexEntryId',
    );
    expect(() => validateTransferArchive(inactiveParent)).toThrow(
      '$.data.chapters[0].actId: active chapter requires an active parent act',
    );
  });

  it('rejects chat cycles and branch selection mismatches', () => {
    const cycle = structuredClone(completeSnapshot());
    cycle.data.chatMessages[0].parentMessageId = 'message-1';
    const wrongBranch = structuredClone(completeSnapshot());
    wrongBranch.data.chatBranchSelections[0].branchGroupId = 'another-branch';

    expect(() => validateTransferArchive(cycle)).toThrow('chat message parent cycle detected');
    expect(() => validateTransferArchive(wrongBranch)).toThrow(
      'selected message must belong to the selected thread and branch group',
    );
  });

  it('rejects system prompt selections with a different category', () => {
    const snapshot = structuredClone(completeSnapshot());
    snapshot.data.activeSystemPromptPresets[0].category = 'summary';

    expect(() => validateTransferArchive(snapshot)).toThrow(
      '$.data.activeSystemPromptPresets[0].presetId: preset category does not match',
    );
  });
});
