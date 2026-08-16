import { describe, expect, it } from 'vitest';

import type { ActRow, ChapterRow, SceneRow } from '../../schema';
import {
  mapActiveManuscriptAggregate,
  mapArchiveOverviewAggregate,
  mapSceneRow,
} from '../manuscript-aggregate.mapper';

describe('manuscript aggregate mapper', () => {
  it('maps SQLite scene values and treats omitted prose as null', () => {
    const row = sceneRow({
      id: 'scene-1',
      prose: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
      includeInContext: 0,
    });

    expect(mapSceneRow(row)).toMatchObject({
      id: 'scene-1',
      prose: { type: 'doc', content: [{ type: 'paragraph' }] },
      includeInContext: false,
    });

    const { prose: _prose, ...lightweightRow } = row;
    expect(mapSceneRow(lightweightRow).prose).toBeNull();
  });

  it('assembles active rows in query order and includes empty child collections', () => {
    const aggregate = mapActiveManuscriptAggregate({
      acts: [actRow({ id: 'act-2', position: 1 }), actRow({ id: 'act-1', position: 0 })],
      chapters: [
        chapterRow({ id: 'chapter-2', actId: 'act-1', position: 1 }),
        chapterRow({ id: 'chapter-1', actId: 'act-1', position: 0 }),
      ],
      scenes: [
        sceneRow({ id: 'scene-2', chapterId: 'chapter-1', position: 1 }),
        sceneRow({ id: 'scene-1', chapterId: 'chapter-1', position: 0 }),
      ],
    });

    expect(aggregate.map(({ id }) => id)).toEqual(['act-2', 'act-1']);
    expect(aggregate[0].chapters).toEqual([]);
    expect(aggregate[1].chapters?.map(({ id }) => id)).toEqual(['chapter-2', 'chapter-1']);
    expect(aggregate[1].chapters?.[0].scenes).toEqual([]);
    expect(aggregate[1].chapters?.[1].scenes?.map(({ id }) => id)).toEqual([
      'scene-2',
      'scene-1',
    ]);
  });

  it('rejects null and unknown active parent references', () => {
    expect(() => mapActiveManuscriptAggregate({
      acts: [actRow()],
      chapters: [chapterRow({ actId: null })],
      scenes: [],
    })).toThrow('Active chapter "chapter-1" references a missing parent act.');

    expect(() => mapActiveManuscriptAggregate({
      acts: [actRow()],
      chapters: [chapterRow({ actId: 'unknown-act' })],
      scenes: [],
    })).toThrow('Active chapter "chapter-1" references a missing parent act.');

    expect(() => mapActiveManuscriptAggregate({
      acts: [actRow()],
      chapters: [chapterRow()],
      scenes: [sceneRow({ chapterId: null })],
    })).toThrow('Active scene "scene-1" references a missing parent chapter.');

    expect(() => mapActiveManuscriptAggregate({
      acts: [actRow()],
      chapters: [chapterRow()],
      scenes: [sceneRow({ chapterId: 'unknown-chapter' })],
    })).toThrow('Active scene "scene-1" references a missing parent chapter.');
  });

  it('assembles archived descendants and orders standalone rows by active parents', () => {
    const overview = mapArchiveOverviewAggregate({
      activeActs: [
        { id: 'active-act-1', position: 0 },
        { id: 'active-act-2', position: 1 },
      ],
      activeChapters: [
        { id: 'active-chapter-2', actId: 'active-act-2', position: 0 },
        { id: 'active-chapter-1', actId: 'active-act-1', position: 0 },
      ],
      archivedActs: [{
        id: 'archived-act', title: 'Archived Act', bookId: 'book-1', position: 0,
        status: 'archived',
      }],
      archivedActChapters: [{
        id: 'nested-chapter', title: 'Nested Chapter', actId: 'archived-act',
        archiveParentTitle: 'Archived Act', position: 0, status: 'archived',
      }],
      archivedActScenes: [{
        id: 'nested-scene', title: 'Nested Scene', chapterId: 'nested-chapter',
        archiveParentTitle: 'Nested Chapter', position: 0, status: 'archived',
      }],
      archivedChapters: [
        archivedChapter('chapter-act-2', 'active-act-2', 0),
        archivedChapter('chapter-detached', null, 0),
        archivedChapter('chapter-act-1', 'active-act-1', 2),
      ],
      archivedChapterScenes: [],
      archivedScenes: [
        archivedScene('scene-chapter-2', 'active-chapter-2', 0),
        archivedScene('scene-detached', null, 0),
        archivedScene('scene-chapter-1', 'active-chapter-1', 2),
      ],
    });

    expect(overview.archivedActs[0].chapters[0].scenes[0].id).toBe('nested-scene');
    expect(overview.archivedChapters.map(({ id }) => id)).toEqual([
      'chapter-act-1',
      'chapter-act-2',
      'chapter-detached',
    ]);
    expect(overview.archivedScenes.map(({ id }) => id)).toEqual([
      'scene-chapter-1',
      'scene-chapter-2',
      'scene-detached',
    ]);
  });
});

function actRow(overrides: Partial<ActRow> = {}): ActRow {
  return {
    id: 'act-1',
    title: 'Act',
    bookId: 'book-1',
    position: 0,
    status: 'active',
    summary: null,
    ...overrides,
  };
}

function chapterRow(overrides: Partial<ChapterRow> = {}): ChapterRow {
  return {
    id: 'chapter-1',
    title: 'Chapter',
    bookId: 'book-1',
    actId: 'act-1',
    position: 0,
    status: 'active',
    archiveParentTitle: null,
    summary: null,
    ...overrides,
  };
}

function sceneRow(overrides: Partial<SceneRow> = {}): SceneRow {
  return {
    id: 'scene-1',
    title: 'Scene',
    bookId: 'book-1',
    chapterId: 'chapter-1',
    position: 0,
    status: 'active',
    archiveParentTitle: null,
    prose: null,
    summary: null,
    wordCount: 0,
    includeInContext: 1,
    pointOfViewOverride: null,
    povCharacterIdOverride: null,
    ...overrides,
  };
}

function archivedChapter(id: string, actId: string | null, position: number) {
  return {
    id,
    title: id,
    actId,
    archiveParentTitle: null,
    position,
    status: 'archived' as const,
  };
}

function archivedScene(id: string, chapterId: string | null, position: number) {
  return {
    id,
    title: id,
    chapterId,
    archiveParentTitle: null,
    position,
    status: 'archived' as const,
  };
}
