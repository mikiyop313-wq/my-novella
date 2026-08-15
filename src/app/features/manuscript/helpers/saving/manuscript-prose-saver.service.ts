import { Injectable, inject } from '@angular/core';
import { Editor } from '@tiptap/core';
import { ManuscriptStore } from '../../store/manuscript.store';
import { TiptapJsonDoc, TiptapNode } from '../../../../../../shared/models/manuscript.model';
import { countWordsInScene, extractTextFromJsonNode } from '../content/manuscript-content.utils';
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

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  private readonly store = inject(ManuscriptStore);
  private readonly structuralDeleteQueue = inject(ManuscriptStructuralDeleteQueueService);
  private readonly paragraphVectorSync = inject(ManuscriptParagraphVectorSyncService);


  // ---------------------------------------------------------------------------
  // Save Queues
  // ---------------------------------------------------------------------------

  private dirtySections = new Map<string, DirtySection>();
  private lastSavedProseSignatures = new Map<string, string>();
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

    const hasDirtySections = this.snapshotDirtySections(affectedIds, editor);
    if (!hasDirtySections) return;

    if (this.proseDebounceTimer !== null) clearTimeout(this.proseDebounceTimer);
    this.proseDebounceTimer = setTimeout(() => this.flushDirtySections(), 2000);
  }


  // ---------------------------------------------------------------------------
  // Flush API
  // ---------------------------------------------------------------------------

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
    const savedSignatures = new Map<string, string>();

    this.dirtySections.forEach(({ prose, wordCount }, id) => {
      savedSignatures.set(id, this.createProseSignature(prose.content));
      promises.push(this.store.updateScene({ id, prose, wordCount }));
    });

    this.dirtySections.clear();
    await Promise.all(promises);

    savedSignatures.forEach((signature, id) => {
      this.lastSavedProseSignatures.set(id, signature);
    });
  }

  /**
   * Drains pending paragraph upsert/delete queues and syncs them to the vector DB.
   */
  async flushParagraphVectorChanges(): Promise<void> {
    await this.paragraphVectorSync.flushParagraphVectorChanges();
  }


  // ---------------------------------------------------------------------------
  // Dirty Section Detection
  // ---------------------------------------------------------------------------

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
  private snapshotDirtySections(affectedIds: Set<string>, editor: Editor): boolean {
    const json = editor.getJSON();
    if (!json.content) return false;

    let currentSceneId: string | null = null;
    let currentContent: TiptapNode[] = [];
    let hasDirtySections = false;

    const commit = (id: string, content: TiptapNode[]) => {
      if (affectedIds.has(id)) {
        if (this.hasMeaningfulProseChange(id, content)) {
          const wordCount = countWordsInScene(editor, id);
          this.dirtySections.set(id, {
            prose: { type: 'doc', content },
            wordCount,
          });
          hasDirtySections = true;
        } else {
          this.dirtySections.delete(id);
        }

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

    return hasDirtySections;
  }


  // ---------------------------------------------------------------------------
  // Snapshot Seeding
  // ---------------------------------------------------------------------------

  seedCleanSnapshots(editor: Editor): void {
    this.seedCleanSnapshotsForScenes(null, editor);
  }

  seedCleanSnapshot(sceneId: string, editor: Editor): void {
    this.seedCleanSnapshotsForScenes(new Set([sceneId]), editor);
  }

  private seedCleanSnapshotsForScenes(sceneIds: Set<string> | null, editor: Editor): void {
    const json = editor.getJSON();
    if (!json.content) return;

    let currentSceneId: string | null = null;
    let currentContent: TiptapNode[] = [];

    const commit = (id: string, content: TiptapNode[]) => {
      if (!sceneIds || sceneIds.has(id)) {
        this.lastSavedProseSignatures.set(id, this.createProseSignature(content));
        this.paragraphVectorSync.seedKnownParagraphs(id, content);
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

  private hasMeaningfulProseChange(sceneId: string, content: TiptapNode[]): boolean {
    const signature = this.createProseSignature(content);
    const lastSavedSignature = this.lastSavedProseSignatures.get(sceneId);
    if (lastSavedSignature === undefined) {
      return signature !== '[]';
    }

    return lastSavedSignature !== signature;
  }

  private createProseSignature(content: TiptapNode[]): string {
    return JSON.stringify(
      content
        .map(node => this.normalizeNodeForSaveSignature(node))
        .filter((node): node is Record<string, unknown> => node !== null)
    );
  }

  private normalizeNodeForSaveSignature(node: TiptapNode): Record<string, unknown> | null {
    if (node.type === 'text') {
      const text = this.normalizeTextForSaveSignature(node.text ?? '');
      if (!text) return null;

      return {
        type: node.type,
        text,
        ...(node.marks ? { marks: node.marks } : {}),
      };
    }

    if (node.type === 'paragraph' && !this.normalizeTextForSaveSignature(extractTextFromJsonNode(node))) {
      return null;
    }

    const normalizedContent = node.content
      ?.map(child => this.normalizeNodeForSaveSignature(child))
      .filter((child): child is Record<string, unknown> => child !== null);

    return {
      type: node.type,
      ...(node.attrs ? { attrs: node.attrs } : {}),
      ...(normalizedContent?.length ? { content: normalizedContent } : {}),
    };
  }

  private normalizeTextForSaveSignature(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
  }
}
