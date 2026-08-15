import { Injectable, inject } from '@angular/core';
import { ElectronService } from '../../../../core/services/electron.service';
import {
  ACT_HEADER_NODE_TYPE,
  CHAPTER_HEADER_NODE_TYPE,
  SCENE_HEADER_NODE_TYPE,
  isHeaderNodeType,
} from '../content/manuscript-node-types';
import type { ManuscriptHeaderNodeType } from '../content/manuscript-node-types';

const DELETE_CHANNEL_BY_NODE_TYPE: Record<ManuscriptHeaderNodeType, string> = {
  [SCENE_HEADER_NODE_TYPE]: 'manuscript:deleteScene',
  [CHAPTER_HEADER_NODE_TYPE]: 'manuscript:deleteChapter',
  [ACT_HEADER_NODE_TYPE]: 'manuscript:deleteAct',
};

@Injectable({ providedIn: 'root' })
export class ManuscriptStructuralDeleteQueueService {
  private readonly electronService = inject(ElectronService);

  private pendingDeletes = new Map<string, ManuscriptHeaderNodeType>();

  /**
   * When structural nodes disappear from the document, cache their IDs for
   * deferred deletion instead of hitting the DB immediately.
   */
  cacheDeletedSections(transaction: any): void {
    const beforeIds = new Map<string, ManuscriptHeaderNodeType>();
    transaction.before.forEach((node: any) => {
      const type = node.type.name;
      if (isHeaderNodeType(type) && node.attrs['id']) {
        beforeIds.set(node.attrs['id'], type);
      }
    });

    const afterIds = new Set<string>();
    transaction.doc.forEach((node: any) => {
      const type = node.type.name;
      if (isHeaderNodeType(type) && node.attrs['id']) {
        afterIds.add(node.attrs['id']);
      }
    });

    beforeIds.forEach((type, id) => {
      if (!afterIds.has(id)) {
        this.pendingDeletes.set(id, type);
      }
    });
  }

  /**
   * When structural nodes reappear in the document, cancel their pending
   * deletion. The DB record was never touched, so nothing needs restoring.
   */
  cancelRestoredSections(transaction: any): void {
    if (this.pendingDeletes.size === 0) return;

    transaction.doc.forEach((node: any) => {
      const type = node.type.name;
      if (isHeaderNodeType(type) && node.attrs['id']) {
        this.pendingDeletes.delete(node.attrs['id']);
      }
    });
  }

  /** Flushes all deferred structural deletions to the DB. */
  async flushStructuralChanges(): Promise<void> {
    if (this.pendingDeletes.size === 0) return;

    const promises: Promise<void>[] = [];
    this.pendingDeletes.forEach((type, id) => {
      promises.push(this.electronService.invoke(DELETE_CHANNEL_BY_NODE_TYPE[type], { id }));
    });

    this.pendingDeletes.clear();
    await Promise.all(promises);
  }
}
