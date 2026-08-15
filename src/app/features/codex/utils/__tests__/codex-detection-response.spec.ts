import { describe, expect, it } from 'vitest';

import type { CodexEntryDto } from '../../../../../../shared/models/codex.model';
import {
  filterNewCodexEntries,
  parseCodexDetectionResponse,
} from '../codex-detection-response';

describe('Codex detection response', () => {
  it('parses and trims an exact valid response', () => {
    expect(parseCodexDetectionResponse(JSON.stringify({
      entries: [{ name: ' Elara ', type: 'character', description: ' A cartographer. ' }],
    }))).toEqual([
      { name: 'Elara', type: 'character', description: 'A cartographer.' },
    ]);
  });

  it.each([
    'not json',
    '```json\n{"entries":[]}\n```',
    '{"entries":{},"extra":true}',
    '{"entries":[{"name":"Elara","type":"person","description":"Known."}]}',
    '{"entries":[{"name":"","type":"character","description":"Known."}]}',
    '{"entries":[{"name":"Elara","type":"character","description":"Known.","extra":true}]}',
  ])('rejects malformed or schema-invalid content: %s', (response) => {
    expect(() => parseCodexDetectionResponse(response)).toThrow();
  });

  it('accepts an empty entries array', () => {
    expect(parseCodexDetectionResponse('{"entries":[]}')).toEqual([]);
  });

  it('filters existing names, aliases, and repeated detected names case-insensitively', () => {
    const existingEntries = [codexEntry('Elara Voss', 'The Cartographer')];
    const detectedEntries = parseCodexDetectionResponse(JSON.stringify({
      entries: [
        { name: 'elara voss', type: 'character', description: 'Existing.' },
        { name: 'the cartographer', type: 'character', description: 'Existing alias.' },
        { name: 'Glass Harbor', type: 'location', description: 'New.' },
        { name: ' glass harbor ', type: 'location', description: 'Repeated.' },
      ],
    }));

    expect(filterNewCodexEntries({ detectedEntries, existingEntries })).toEqual([
      { name: 'Glass Harbor', type: 'location', description: 'New.' },
    ]);
  });
});

function codexEntry(name: string, alias: string | null): CodexEntryDto {
  return {
    id: 'entry-1',
    bookId: 'book-1',
    type: 'character',
    name,
    alias,
    description: null,
    image: null,
    status: 'archived',
    trackingSetting: 'include_when_detected',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
  };
}
