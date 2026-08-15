import { Injectable, inject } from '@angular/core';
import { Editor } from '@tiptap/core';
import { ManuscriptStore } from '../store/manuscript.store';
import { TiptapJsonDoc, TiptapNode } from '../../../../../shared/models/manuscript.model';
import { countWordsInScene, extractTextFromJsonNode } from './manuscript-content.utils';
import { ElectronService } from '../../../core/services/electron.service';
import { ParagraphUpsert, ParagraphDelete, UpsertParagraphsPayload, DeleteParagraphsPayload } from '../../../../../shared/models/vector.model';

export type { ParagraphUpsert, ParagraphDelete, UpsertParagraphsPayload, DeleteParagraphsPayload };

interface DirtySection {
  prose: TiptapJsonDoc;
  wordCount: number;
}

/** ProseMirror node type names that mark structural section boundaries. */
const HEADER_NODE_TYPES = new Set(['actHeader', 'chapterHeader', 'sceneSummary']);

@Injectable({ providedIn: 'root' })
export class ManuscriptProseSaverService {
  private readonly store = inject(ManuscriptStore);
  private readonly electronService = inject(ElectronService);

  // ── Prose dirty-section tracking ─────────────────────────────────────────
  private dirtySections = new Map<string, DirtySection>();
  private proseDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Scene title debounce ─────────────────────────────────────────────────
  private pendingSceneTitle: string | null = null;
  private sceneTitleTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Structural change cache (deferred until exit) ────────────────────────
  // Maps node ID → node type name. Entries accumulate during the session and
  // are flushed as DB deletes only when the user leaves the manuscript.
  // If a node is removed (undo / backspace) then re-added (redo), the entry
  // is cancelled out so no DB operation is needed.
  private pendingDeletes = new Map<string, string>();

  // ── Paragraph-level vector DB cache ─────────────────────────────────────
  // `pendingUpserts`  – paragraphs that were added or modified (need upsert).
  // `pendingDeletes_` – paragraphs that disappeared from the doc (need delete).
  // `lastKnownParagraphs` – per-scene snapshot of the previous paragraph list,
  //   used to diff against the new content on every scene flush.
  // Undo/redo are automatically handled: a restored paragraph cancels its
  // pending delete; a re-deleted paragraph cancels its pending upsert.
  private pendingUpserts = new Map<string, ParagraphUpsert>();
  private pendingDeletes_ = new Map<string, ParagraphDelete>();
  private lastKnownParagraphs = new Map<string, Record<string, any>[]>();

  // ────────────────────────────────────────────────────────────────────────
  // Prose auto-save
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Called on every Tiptap `onUpdate` where `docChanged` is true.
   * Inspects the transaction steps to identify the affected section,
   * snapshots its prose JSON, and schedules a debounced DB write.
   */
  onDocumentChanged(transaction: any, editor: Editor): void {
    this.cacheDeletedSections(transaction);
    this.cancelRestoredSections(transaction);

    const affectedIds = this.findAffectedSectionIds(transaction, editor);
    if (affectedIds.size === 0) return;

    this.snapshotDirtySections(affectedIds, editor);

    if (this.proseDebounceTimer !== null) clearTimeout(this.proseDebounceTimer);
    this.proseDebounceTimer = setTimeout(() => this.flushDirtySections(), 2000);
  }

  /**
   * When structural nodes disappear from the document (undo, backspace, etc.),
   * cache their IDs for deferred deletion instead of hitting the DB immediately.
   */
  private cacheDeletedSections(transaction: any): void {
    const beforeIds = new Map<string, string>();
    transaction.before.forEach((node: any) => {
      if (HEADER_NODE_TYPES.has(node.type.name) && node.attrs['id']) {
        beforeIds.set(node.attrs['id'], node.type.name);
      }
    });

    const afterIds = new Set<string>();
    transaction.doc.forEach((node: any) => {
      if (HEADER_NODE_TYPES.has(node.type.name) && node.attrs['id']) {
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
   * When structural nodes reappear in the document (redo), cancel their
   * pending deletion — the DB record was never touched, so nothing to restore.
   */
  private cancelRestoredSections(transaction: any): void {
    if (this.pendingDeletes.size === 0) return;

    transaction.doc.forEach((node: any) => {
      if (HEADER_NODE_TYPES.has(node.type.name) && node.attrs['id']) {
        this.pendingDeletes.delete(node.attrs['id']);
      }
    });
  }

  /**
   * Physical delete — flushes all deferred structural deletions to the DB.
   *
   * Called once when the user leaves the manuscript (navigation or app close).
   * At this point every node in `pendingDeletes` has been confirmed removed
   * from the editor (no outstanding undos can restore them), so it is safe to
   * issue the real IPC deletes.
   *
   * IPC is called directly here — NOT through the store — to avoid:
   *   1. Re-triggering `deleteNodeRangeInDoc` on an editor that may be destroyed.
   *   2. Any circular dependency between the store and the saver.
   *
   * DB cascade (onDelete: 'cascade') handles child rows automatically, so we
   * only need to delete the top-level node (act, chapter, or scene header).
   */
  async flushStructuralChanges(): Promise<void> {
    if (this.pendingDeletes.size === 0) return;

    const promises: Promise<void>[] = [];
    this.pendingDeletes.forEach((type, id) => {
      if (type === 'sceneSummary')
        promises.push(this.electronService.invoke('manuscript:deleteScene', { id }));
      else if (type === 'chapterHeader')
        promises.push(this.electronService.invoke('manuscript:deleteChapter', { id }));
      else if (type === 'actHeader')
        promises.push(this.electronService.invoke('manuscript:deleteAct', { id }));
    });
    this.pendingDeletes.clear();
    await Promise.all(promises);
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

  // ────────────────────────────────────────────────────────────────────────
  // Scene title auto-save
  // ────────────────────────────────────────────────────────────────────────

  /** Schedules a debounced save for the scene title (500 ms). */
  scheduleSceneTitleSave(title: string): void {
    this.pendingSceneTitle = title;
    if (this.sceneTitleTimer !== null) clearTimeout(this.sceneTitleTimer);
    this.sceneTitleTimer = setTimeout(() => this.flushSceneTitle(), 500);
  }

  /** Persists the pending scene title immediately and clears the timer. */
  async flushSceneTitle(): Promise<void> {
    if (this.sceneTitleTimer !== null) {
      clearTimeout(this.sceneTitleTimer);
      this.sceneTitleTimer = null;
    }
    if (this.pendingSceneTitle === null) return;
    const sceneId = this.store.sceneId();
    if (sceneId) await this.store.updateScene({ id: sceneId, title: this.pendingSceneTitle });
    this.pendingSceneTitle = null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Walks the transaction steps to find the IDs of the scene sections
   * that contain the changed positions. Only scenes hold prose.
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

      // Walk backwards to find the nearest sceneSummary header before this position.
      for (let i = children.length - 1; i >= 0; i--) {
        const { node, from } = children[i];
        if (from > pos) continue;
        if (node.type.name === 'sceneSummary' && node.attrs['id']) {
          affectedIds.add(node.attrs['id']);
          break;
        }
      }
    }

    return affectedIds;
  }

  /**
   * Walks the editor's JSON document tree and records the prose content
   * for each scene whose ID is in `affectedIds`, updating `dirtySections`.
   *
   * Only sceneSummary sections accumulate prose. Act and chapter headers
   * are treated as boundaries but their content is not persisted.
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
          wordCount
        });
        this.snapshotDirtyParagraphs(id, content);
      }
    };

    for (const node of json.content) {
      if (HEADER_NODE_TYPES.has(node.type)) {
        // Commit the previous scene before starting a new section
        if (currentSceneId) {
          commit(currentSceneId, currentContent);
        }
        // Only track scene sections for prose
        if (node.type === 'sceneSummary') {
          currentSceneId = node.attrs?.['id'] ?? null;
          currentContent = [];
        } else {
          // Act/chapter header — reset tracking (no prose to save)
          currentSceneId = null;
          currentContent = [];
        }
      } else if (currentSceneId) {
        // Accumulate prose nodes (paragraphs, headings, etc.) for the current scene.
        // Skip `sceneSkeleton` nodes — they are lazy-loading placeholders, not real prose,
        // and must never be written to the database.
        if (node.type !== 'sceneSkeleton') {
          currentContent.push(node);
        }
      }
    }

    // Commit the last scene
    if (currentSceneId) {
      commit(currentSceneId, currentContent);
    }
  }

  /**
   * Diffs the new paragraph list for a scene against the last-known snapshot.
   * Paragraphs that changed or are new → `paragraphDirty`.
   * Paragraphs that disappeared         → `paragraphDeleted`.
   * Undo/redo are handled by cancelling the opposite pending entry.
   */
  private snapshotDirtyParagraphs(
    sceneId: string,
    newContent: Record<string, any>[]
  ): void {
    const previous = this.lastKnownParagraphs.get(sceneId) ?? [];
    const prevMap = new Map<string, Record<string, any>>();
    previous.forEach(node => {
      const id = node['attrs']?.['id'] as string | undefined;
      if (id) prevMap.set(id, node);
    });

    const newIds = new Set<string>();

    newContent.forEach((node, index) => {
      const paraId = node['attrs']?.['id'] as string | undefined;
      if (!paraId) return;
      newIds.add(paraId);

      const text = extractTextFromJsonNode(node);
      const hash = this.simpleHash(text);
      const prevNode = prevMap.get(paraId);
      const prevHash = prevNode
        ? this.simpleHash(extractTextFromJsonNode(prevNode))
        : null;

      if (prevHash !== hash) {
        // New or modified paragraph — queue for upsert.
        this.pendingUpserts.set(paraId, { paragraphId: paraId, sceneId, text, hash, position: index });
        // Cancel any pending delete for this paragraph (redo scenario).
        this.pendingDeletes_.delete(paraId);
      }
    });

    // Paragraphs present before but gone now → queue for deletion.
    prevMap.forEach((_, paraId) => {
      if (!newIds.has(paraId)) {
        this.pendingDeletes_.set(paraId, { paragraphId: paraId, sceneId });
        // Cancel any pending upsert for this paragraph (undo scenario).
        this.pendingUpserts.delete(paraId);
      }
    });

    this.lastKnownParagraphs.set(sceneId, newContent);
  }

  /**
   * Drains the pending upsert/delete queues and sends the batch to the
   * main process via IPC to sync with the vector DB.
   *
   * No-ops silently if there are no changes.
   * Must be called after flushDirtySections() so the paragraph cache is
   * fully populated before being drained.
   */
  async flushParagraphVectorChanges(): Promise<void> {
    const upserts = [...this.pendingUpserts.values()];
    const deletes = [...this.pendingDeletes_.values()];
    this.pendingUpserts.clear();
    this.pendingDeletes_.clear();

    if (!upserts.length && !deletes.length) return;

    console.debug(
      `[VectorSync] Flushing — ${upserts.length} upsert(s), ${deletes.length} delete(s)`,
      {
        upserts: upserts.map(u => ({ id: u.paragraphId, scene: u.sceneId, chars: u.text.length })),
        deletes: deletes.map(d => ({ id: d.paragraphId, scene: d.sceneId }))
      }
    );

    try {
      const bookId = this.store.bookId();
      if (!bookId) {
        console.warn('[VectorSync] No bookId in store — skipping vector sync.');
        return;
      }

      const calls: Promise<void>[] = [];

      if (upserts.length > 0) {
        calls.push(
          this.electronService.invoke('vectors:upsertParagraphs', { bookId, upserts } satisfies UpsertParagraphsPayload)
        );
      }

      if (deletes.length > 0) {
        calls.push(
          this.electronService.invoke('vectors:deleteParagraphs', { deletes } satisfies DeleteParagraphsPayload)
        );
      }

      await Promise.all(calls);
      console.debug('[VectorSync] IPC call(s) completed successfully');
    } catch (error) {
      console.error('[VectorSync] Vector DB sync failed:', error);
    }
  }

  // ── Private utilities ────────────────────────────────────────────────────

  /**
   * Lightweight djb2 string hash — fast enough for per-keystroke diffing.
   * Collisions are astronomically unlikely for paragraph-length strings.
   */
  private simpleHash(text: string): string {
    let h = 5381;
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) + h) ^ text.charCodeAt(i);
    }
    return (h >>> 0).toString(36);
  }
}
