import { describe, expect, it } from 'vitest';

import {
  CodexDetectionStateService,
  type PendingCodexDetection,
} from '../codex-detection-state.service';

describe('CodexDetectionStateService', () => {
  it('keeps one active batch per book and queues later results in completion order', () => {
    const service = new CodexDetectionStateService();
    const first = detection('book-1', 'scene-2', 'Second scene finished first');
    const second = detection('book-1', 'scene-1', 'First scene finished second');
    const otherBook = detection('book-2', 'scene-3', 'Other book');

    expect(service.enqueue(first)).toBe(true);
    expect(service.enqueue(second)).toBe(true);
    expect(service.enqueue(otherBook)).toBe(true);

    expect(service.activeDetection('book-1')).toBe(first);
    expect(service.nextQueued('book-1')).toBe(second);
    expect(service.activeDetection('book-2')).toBe(otherBook);
  });

  it('rejects another result for a scene until its pending batch is completed', () => {
    const service = new CodexDetectionStateService();
    const first = detection('book-1', 'scene-1', 'Elara');

    service.enqueue(first);

    expect(service.enqueue(detection('book-1', 'scene-1', 'Elara again'))).toBe(false);
    expect(service.completeActive({ ...first })).toBe(false);
    expect(service.completeActive(first)).toBe(true);
    expect(service.hasPendingDetection({ bookId: 'book-1', sceneId: 'scene-1' })).toBe(false);
  });

  it('activates only the current queued head for a book', () => {
    const service = new CodexDetectionStateService();
    const active = detection('book-1', 'scene-1', 'Active');
    const next = detection('book-1', 'scene-2', 'Next');
    const later = detection('book-1', 'scene-3', 'Later');
    service.enqueue(active);
    service.enqueue(next);
    service.enqueue(later);
    service.completeActive(active);

    expect(service.activateQueued(later, later.entries)).toBe(false);
    expect(service.activateQueued(next, [{ ...next.entries[0], description: 'Filtered' }])).toBe(true);
    expect(service.activeDetection('book-1')?.entries[0].description).toBe('Filtered');
    expect(service.nextQueued('book-1')).toBe(later);
  });
});

function detection(bookId: string, sceneId: string, name: string): PendingCodexDetection {
  return {
    bookId,
    sceneId,
    entries: [{ name, type: 'character', description: `${name} description` }],
  };
}
