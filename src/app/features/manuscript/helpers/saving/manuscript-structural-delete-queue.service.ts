import { Injectable, inject } from '@angular/core';
import { ManuscriptStructureService } from '../../../workspace/services/manuscript-structure.service';
import {
  ACT_HEADER_NODE_TYPE,
  CHAPTER_HEADER_NODE_TYPE,
  SCENE_HEADER_NODE_TYPE,
  isHeaderNodeType,
} from '../content/manuscript-node-types';
import type { ManuscriptHeaderNodeType } from '../content/manuscript-node-types';

@Injectable({ providedIn: 'root' })
export class ManuscriptStructuralDeleteQueueService {

  // ---------------------------------------------------------------------------
  // Dependencies / Queue
  // ---------------------------------------------------------------------------

  private readonly manuscriptStructureService = inject(ManuscriptStructureService);

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
      if (type === ACT_HEADER_NODE_TYPE) {
        promises.push(this.manuscriptStructureService.deleteAct(id));
      } else if (type === CHAPTER_HEADER_NODE_TYPE) {
        promises.push(this.manuscriptStructureService.deleteChapter(id));
      } else if (type === SCENE_HEADER_NODE_TYPE) {
        promises.push(this.manuscriptStructureService.deleteScene(id));
      }
    });

    this.pendingDeletes.clear();
    await Promise.all(promises);
  }
}
