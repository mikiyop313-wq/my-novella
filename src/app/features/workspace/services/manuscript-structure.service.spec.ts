import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ElectronService } from '../../../core/services/electron.service';
import { ManuscriptStructureService } from './manuscript-structure.service';

describe('ManuscriptStructureService', () => {
  let service: ManuscriptStructureService;
  let electronService: { invoke: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    electronService = {
      invoke: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ManuscriptStructureService,
        { provide: ElectronService, useValue: electronService },
      ],
    });

    service = TestBed.inject(ManuscriptStructureService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('maps outline operations to manuscript IPC channels', async () => {
    const result = { id: 'result-1' };
    electronService.invoke.mockResolvedValue(result);

    await expect(service.getOutline('book-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:getOutline', { bookId: 'book-1' });

    await expect(service.getBookHierarchy('book', 'book-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:getBookHierarchy', {
      mode: 'book',
      id: 'book-1',
    });

    await expect(service.getArchiveOverview('book-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith(
      'manuscript:getArchiveOverview',
      { bookId: 'book-1' },
    );

    await expect(service.createAct('book-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:createAct', { bookId: 'book-1' });

    await expect(service.createChapter('act-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:createChapter', { actId: 'act-1' });

    await expect(service.createScene('chapter-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:createScene', { chapterId: 'chapter-1' });

    await expect(service.createActStructure('book-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith(
      'manuscript:createActStructure',
      { bookId: 'book-1' },
    );

    await expect(service.createChapterStructure('act-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith(
      'manuscript:createChapterStructure',
      { actId: 'act-1' },
    );

    await expect(service.deleteAct('act-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:deleteAct', { id: 'act-1' });

    await expect(service.deleteChapter('chapter-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:deleteChapter', { id: 'chapter-1' });

    await expect(service.deleteScene('scene-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:deleteScene', { id: 'scene-1' });

    await expect(service.archiveAct('act-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:archiveAct', { id: 'act-1' });

    await expect(service.archiveChapter('chapter-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:archiveChapter', { id: 'chapter-1' });

    await expect(service.archiveScene('scene-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:archiveScene', { id: 'scene-1' });

    await expect(service.restoreAct('act-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:restoreAct', { id: 'act-1' });

    await expect(service.restoreChapter('chapter-1', 'act-2')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith(
      'manuscript:restoreChapter',
      { id: 'chapter-1', targetActId: 'act-2' },
    );

    await expect(service.restoreScene('scene-1', 'chapter-2')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith(
      'manuscript:restoreScene',
      { id: 'scene-1', targetChapterId: 'chapter-2' },
    );

    await expect(service.updateAct({ id: 'act-1', title: 'Updated Act' })).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith(
      'manuscript:updateAct',
      { id: 'act-1', title: 'Updated Act' },
    );

    await expect(service.updateChapter({ id: 'chapter-1', title: 'Updated Chapter' })).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith(
      'manuscript:updateChapter',
      { id: 'chapter-1', title: 'Updated Chapter' },
    );

    await expect(service.updateScene({ id: 'scene-1', summary: 'Updated summary' })).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith(
      'manuscript:updateScene',
      { id: 'scene-1', summary: 'Updated summary' },
    );

    const payload = {
      acts: [
        { id: 'act-2', bookId: 'book-1', position: 0 },
        { id: 'act-1', bookId: 'book-1', position: 1 },
      ],
    };
    await expect(service.updateStructurePositions(payload)).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('manuscript:updateStructurePositions', payload);

    const inclusion = { entityType: 'chapter' as const, id: 'chapter-1', included: false };
    await expect(service.setContextInclusion(inclusion)).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith(
      'manuscript:setContextInclusion',
      inclusion,
    );
  });
});
