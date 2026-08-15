import { Injectable, inject } from '@angular/core';

import { ElectronService } from '../../../core/services/electron.service';
import {
  ActDto,
  ArchiveOverviewDto,
  ChapterDto,
  ManuscriptMode,
  SceneDto,
  UpdateActPayload,
  UpdateChapterPayload,
  UpdateScenePayload,
  UpdateStructurePositionsPayload,
} from '../../../../../shared/models/manuscript.model';

@Injectable({
  providedIn: 'root',
})
export class ManuscriptStructureService {
  private readonly electronService = inject(ElectronService);

  async getOutline(bookId: string): Promise<ActDto[]> {
    return await this.electronService.invoke('manuscript:getOutline', { bookId });
  }

  async getBookHierarchy(mode: ManuscriptMode, id: string): Promise<ActDto[]> {
    return await this.electronService.invoke('manuscript:getBookHierarchy', {
      mode,
      id,
    });
  }

  async getArchiveOverview(bookId: string): Promise<ArchiveOverviewDto> {
    return await this.electronService.invoke('manuscript:getArchiveOverview', { bookId });
  }

  async createAct(bookId: string): Promise<ActDto> {
    return await this.electronService.invoke('manuscript:createAct', { bookId });
  }

  async createChapter(actId: string): Promise<ChapterDto> {
    return await this.electronService.invoke('manuscript:createChapter', { actId });
  }

  async createScene(chapterId: string): Promise<SceneDto> {
    return await this.electronService.invoke('manuscript:createScene', { chapterId });
  }

  async deleteAct(id: string): Promise<void> {
    return await this.electronService.invoke('manuscript:deleteAct', { id });
  }

  async deleteChapter(id: string): Promise<void> {
    return await this.electronService.invoke('manuscript:deleteChapter', { id });
  }

  async deleteScene(id: string): Promise<void> {
    return await this.electronService.invoke('manuscript:deleteScene', { id });
  }

  async archiveAct(id: string): Promise<void> {
    return await this.electronService.invoke('manuscript:archiveAct', { id });
  }

  async archiveChapter(id: string): Promise<void> {
    return await this.electronService.invoke('manuscript:archiveChapter', { id });
  }

  async archiveScene(id: string): Promise<void> {
    return await this.electronService.invoke('manuscript:archiveScene', { id });
  }

  async restoreAct(id: string): Promise<void> {
    return await this.electronService.invoke('manuscript:restoreAct', { id });
  }

  async restoreChapter(id: string, targetActId: string): Promise<void> {
    return await this.electronService.invoke('manuscript:restoreChapter', { id, targetActId });
  }

  async restoreScene(id: string, targetChapterId: string): Promise<void> {
    return await this.electronService.invoke('manuscript:restoreScene', {
      id,
      targetChapterId,
    });
  }

  async updateAct(payload: UpdateActPayload): Promise<ActDto> {
    return await this.electronService.invoke('manuscript:updateAct', payload);
  }

  async updateChapter(payload: UpdateChapterPayload): Promise<ChapterDto> {
    return await this.electronService.invoke('manuscript:updateChapter', payload);
  }

  async updateScene(payload: UpdateScenePayload): Promise<SceneDto> {
    return await this.electronService.invoke('manuscript:updateScene', payload);
  }

  async updateStructurePositions(payload: UpdateStructurePositionsPayload): Promise<void> {
    return await this.electronService.invoke('manuscript:updateStructurePositions', payload);
  }
}
