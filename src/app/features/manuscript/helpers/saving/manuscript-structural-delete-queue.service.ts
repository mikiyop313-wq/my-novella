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

  private pendingDeletes = new Map<string, {
    type: ManuscriptHeaderNodeType;
    parentId: string | null;
    preservePositions: boolean;
  }>();
  private splitRootIds = new Set<string>();

  registerSplitRoot(id: string): void {
    this.splitRootIds.add(id);
  }

  pendingDeleteIds(): Set<string> {
    return new Set(this.pendingDeletes.keys());
  }

  /**
   * When structural nodes disappear from the document, cache their IDs for
   * deferred deletion instead of hitting the DB immediately.
   */
  cacheDeletedSections(transaction: any): void {
    const beforeIds = new Map<string, {
      type: ManuscriptHeaderNodeType;
      parentId: string | null;
      preservePositions: boolean;
    }>();
    transaction.before.forEach((node: any) => {
      const type = node.type.name;
      if (isHeaderNodeType(type) && node.attrs['id']) {
        const parentId = type === CHAPTER_HEADER_NODE_TYPE
          ? node.attrs['actId'] ?? null
          : type === SCENE_HEADER_NODE_TYPE
            ? node.attrs['chapterId'] ?? null
            : null;
        beforeIds.set(node.attrs['id'], {
          type,
          parentId,
          preservePositions: this.splitRootIds.has(node.attrs['id']),
        });
      }
    });

    const afterIds = new Set<string>();
    transaction.doc.forEach((node: any) => {
      const type = node.type.name;
      if (isHeaderNodeType(type) && node.attrs['id']) {
        afterIds.add(node.attrs['id']);
      }
    });

    beforeIds.forEach((entry, id) => {
      if (!afterIds.has(id)) {
        this.pendingDeletes.set(id, entry);
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
    this.pendingDeletes.forEach(({ type, parentId, preservePositions }, id) => {
      const parent = parentId ? this.pendingDeletes.get(parentId) : undefined;
      if (parent?.type === ACT_HEADER_NODE_TYPE || parent?.type === CHAPTER_HEADER_NODE_TYPE) return;
      if (type === ACT_HEADER_NODE_TYPE) {
        promises.push(this.manuscriptStructureService.deleteAct(id, { preservePositions }));
      } else if (type === CHAPTER_HEADER_NODE_TYPE) {
        promises.push(this.manuscriptStructureService.deleteChapter(id, { preservePositions }));
      } else if (type === SCENE_HEADER_NODE_TYPE) {
        promises.push(this.manuscriptStructureService.deleteScene(id, { preservePositions }));
      }
      this.splitRootIds.delete(id);
    });

    this.pendingDeletes.clear();
    await Promise.all(promises);
  }
}
