import { Injectable, inject } from '@angular/core';
import { Editor } from '@tiptap/core';
import { ManuscriptStore } from '../../store/manuscript.store';
import { TiptapJsonDoc, TiptapNode } from '../../../../../../shared/models/manuscript.model';
import { countWordsInScene } from '../content/manuscript-content.utils';
import { ManuscriptStructuralDeleteQueueService } from './manuscript-structural-delete-queue.service';
import { ManuscriptParagraphVectorSyncService } from './manuscript-paragraph-vector-sync.service';
import {
  SCENE_HEADER_NODE_TYPE,
  SCENE_SKELETON_NODE_TYPE,
  isHeaderNodeType,
  isSceneHeaderNodeType,
} from '../content/manuscript-node-types';

export type {
  ParagraphUpsert,
  ParagraphDelete,
  UpsertParagraphsPayload,
  DeleteParagraphsPayload,
} from '../../../../../../shared/models/vector.model';

interface DirtySection {
  prose: TiptapJsonDoc;
  wordCount: number;
}

@Injectable({ providedIn: 'root' })
export class ManuscriptProseSaverService {
  private readonly store = inject(ManuscriptStore);
  private readonly structuralDeleteQueue = inject(ManuscriptStructuralDeleteQueueService);
  private readonly paragraphVectorSync = inject(ManuscriptParagraphVectorSyncService);

  private dirtySections = new Map<string, DirtySection>();
  private proseDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Called on every Tiptap `onUpdate` where `docChanged` is true.
   * Inspects the transaction steps to identify affected scene sections,
   * snapshots their prose JSON, and schedules a debounced DB write.
   */
  onDocumentChanged(transaction: any, editor: Editor): void {
    this.structuralDeleteQueue.cacheDeletedSections(transaction);
    this.structuralDeleteQueue.cancelRestoredSections(transaction);

    const affectedIds = this.findAffectedSectionIds(transaction, editor);
    if (affectedIds.size === 0) return;

    this.snapshotDirtySections(affectedIds, editor);

    if (this.proseDebounceTimer !== null) clearTimeout(this.proseDebounceTimer);
    this.proseDebounceTimer = setTimeout(() => this.flushDirtySections(), 2000);
  }

  /**
   * Physical delete: flushes all deferred structural deletions to the DB.
   *
   * Called once when the user leaves the manuscript. At this point every node
   * in the queue has been confirmed removed from the editor, so it is safe to
   * issue the real IPC deletes.
   */
  async flushStructuralChanges(): Promise<void> {
    await this.structuralDeleteQueue.flushStructuralChanges();
  }

  /** Persists all dirty scene sections immediately and clears the queue. */
  async flushDirtySections(): Promise<void> {
    if (this.proseDebounceTimer !== null) {
      clearTimeout(this.proseDebounceTimer);
      this.proseDebounceTimer = null;
    }

    const promises: Promise<void>[] = [];
    this.dirtySections.forEach(({ prose, wordCount }, id) => {
      promises.push(this.store.updateScene({ id, prose, wordCount }));
    });

    this.dirtySections.clear();
    await Promise.all(promises);
  }

  /**
   * Walks the transaction steps to find the IDs of the scene sections that
   * contain the changed positions. Only scenes hold prose.
   */
  private findAffectedSectionIds(transaction: any, editor: Editor): Set<string> {
    const children: Array<{ node: any; from: number }> = [];
    editor.state.doc.forEach((node: any, offset: number) =>
      children.push({ node, from: offset })
    );

    const affectedIds = new Set<string>();

    for (const step of transaction.steps) {
      const pos: number = step.from ?? step.jsonID;
      if (typeof pos !== 'number') continue;

      for (let i = children.length - 1; i >= 0; i--) {
        const { node, from } = children[i];
        if (from > pos) continue;
        if (isSceneHeaderNodeType(node.type.name) && node.attrs['id']) {
          affectedIds.add(node.attrs['id']);
          break;
        }
      }
    }

    return affectedIds;
  }

  /**
   * Walks the editor's JSON document tree and records prose content for each
   * affected scene, updating `dirtySections`.
   */
  private snapshotDirtySections(affectedIds: Set<string>, editor: Editor): void {
    const json = editor.getJSON();
    if (!json.content) return;

    let currentSceneId: string | null = null;
    let currentContent: TiptapNode[] = [];

    const commit = (id: string, content: TiptapNode[]) => {
      if (affectedIds.has(id)) {
        const wordCount = countWordsInScene(editor, id);
        this.dirtySections.set(id, {
          prose: { type: 'doc', content },
          wordCount,
        });
        this.paragraphVectorSync.snapshotDirtyParagraphs(id, content);
      }
    };

    for (const node of json.content) {
      if (isHeaderNodeType(node.type)) {
        if (currentSceneId) {
          commit(currentSceneId, currentContent);
        }

        if (node.type === SCENE_HEADER_NODE_TYPE) {
          currentSceneId = node.attrs?.['id'] ?? null;
          currentContent = [];
        } else {
          currentSceneId = null;
          currentContent = [];
        }
      } else if (currentSceneId) {
        if (node.type !== SCENE_SKELETON_NODE_TYPE) {
          currentContent.push(node);
        }
      }
    }

    if (currentSceneId) {
      commit(currentSceneId, currentContent);
    }
  }

  /**
   * Drains the pending upsert/delete queues and sends the batch to the main
   * process via IPC to sync with the vector DB.
   */
  async flushParagraphVectorChanges(): Promise<void> {
    await this.paragraphVectorSync.flushParagraphVectorChanges();
  }
}
