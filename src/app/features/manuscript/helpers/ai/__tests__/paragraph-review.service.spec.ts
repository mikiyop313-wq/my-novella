import { describe, expect, it } from 'vitest';

import type { SimilarParagraphResult } from '../../../../../../../shared/models/vector.model';
import { ParagraphReviewService } from '../paragraph-review.service';

describe('ParagraphReviewService', () => {
  it('resolves accepted paragraphs in original relevance order', async () => {
    const service = new ParagraphReviewService();
    const first = result('paragraph-1');
    const second = result('paragraph-2');
    const review = service.review([
      { result: first, location: 'Act 1 > Chapter 1 > Scene 1' },
      { result: second, location: 'Act 1 > Chapter 1 > Scene 2' },
    ]);

    service.accept(second);
    service.accept(first);
    service.complete();

    await expect(review).resolves.toEqual([first, second]);
    expect(service.activeReview()).toBeNull();
  });

  it('treats unresolved paragraphs as rejected when completed early', async () => {
    const service = new ParagraphReviewService();
    const first = result('paragraph-1');
    const review = service.review([
      { result: first, location: 'Scene 1' },
      { result: result('paragraph-2'), location: 'Scene 2' },
    ]);

    service.accept(first);
    service.complete();

    await expect(review).resolves.toEqual([first]);
  });
});

function result(paragraphId: string): SimilarParagraphResult {
  return {
    paragraphId,
    actId: 'act-1',
    chapterId: 'chapter-1',
    sceneId: `scene-${paragraphId}`,
    text: `Text for ${paragraphId}`,
    distance: 0.1,
  };
}
