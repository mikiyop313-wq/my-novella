import { Injectable, inject } from '@angular/core';

import { ElectronService } from '../../../core/services/electron.service';
import {
  ActDto,
  ChapterDto,
  SceneDto,
  UpdateActPayload,
  UpdateChapterPayload,
  UpdateScenePayload,
  UpdateStructurePositionsPayload,
} from '../../../../../shared/models/manuscript.model';

@Injectable({
  providedIn: 'root',
})
export class OutlineService {
  private readonly electronService = inject(ElectronService);

  async getOutline(bookId: string): Promise<ActDto[]> {
    return await this.electronService.invoke('manuscript:getOutline', { bookId });
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
