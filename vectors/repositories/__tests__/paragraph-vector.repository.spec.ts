import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getManuscriptTable: vi.fn(),
    distanceRange: vi.fn(),
}));

vi.mock('../../lancedb.connection', () => ({
    escapeLanceSql: (value: string) => value,
    vectorDb: { getManuscriptTable: mocks.getManuscriptTable },
}));

import { ParagraphVectorRepository } from '../paragraph-vector.repository';

describe('ParagraphVectorRepository semantic search', () => {
    const space = {
        provider: 'local' as const,
        model: 'BAAI/bge-m3',
        dimensions: 3,
        revision: '1',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        const query = {
            distanceType: vi.fn(),
            where: vi.fn(),
            distanceRange: mocks.distanceRange,
            limit: vi.fn(),
            toArray: vi.fn().mockResolvedValue([]),
        };
        Object.values(query).forEach(method => {
            if (method !== query.toArray) method.mockReturnValue(query);
        });
        mocks.getManuscriptTable.mockResolvedValue({
            vectorSearch: vi.fn().mockReturnValue(query),
        });
    });

    it('keeps the current nearest-neighbor query when no threshold is supplied', async () => {
        await new ParagraphVectorRepository().searchSimilar({
            space,
            bookId: 'book-1',
            queryVector: [1, 2, 3],
            limit: 3,
        });

        expect(mocks.distanceRange).not.toHaveBeenCalled();
    });

    it.each([
        [0, 1],
        [0.7, 0.3],
        [1, 0],
    ])('converts minimum similarity %s to maximum cosine distance %s', async (
        minimumSimilarity,
        maximumDistance,
    ) => {
        await new ParagraphVectorRepository().searchSimilar({
            space,
            bookId: 'book-1',
            queryVector: [1, 2, 3],
            limit: 3,
            minimumSimilarity,
        });

        const [lowerBound, actualMaximumDistance] = mocks.distanceRange.mock.calls[0];
        expect(lowerBound).toBeUndefined();
        expect(actualMaximumDistance).toBeCloseTo(maximumDistance);
    });
});
