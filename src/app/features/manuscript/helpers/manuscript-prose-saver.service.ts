import { Injectable, inject } from '@angular/core';
import { Editor } from '@tiptap/core';
import { ManuscriptStore } from '../store/manuscript.store';
import { TiptapJsonDoc } from '../../../../../shared/models/manuscript.model';
import { countWordsInScene } from './manuscript-content.utils';

interface DirtySection {
  prose: TiptapJsonDoc;
  wordCount: number;
}

/** ProseMirror node type names that mark structural section boundaries. */
const HEADER_NODE_TYPES = new Set(['actHeader', 'chapterHeader', 'sceneSummary']);

@Injectable({ providedIn: 'root' })
export class ManuscriptProseSaverService {
  private readonly store = inject(ManuscriptStore);

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
   * Applies all cached structural deletions to the database.
   * Called once when the user leaves the manuscript (ngOnDestroy).
   */
  flushStructuralChanges(): void {
    if (this.pendingDeletes.size === 0) return;

    this.pendingDeletes.forEach((type, id) => {
      if (type === 'sceneSummary')  this.store.deleteScene(id);
      else if (type === 'chapterHeader') this.store.deleteChapter(id);
      else if (type === 'actHeader')     this.store.deleteAct(id);
    });
    this.pendingDeletes.clear();
  }

  /** Persists all dirty scene sections immediately and clears the queue. */
  flushDirtySections(): void {
    if (this.proseDebounceTimer !== null) {
      clearTimeout(this.proseDebounceTimer);
      this.proseDebounceTimer = null;
    }
    this.dirtySections.forEach(({ prose, wordCount }, id) => {
      this.store.updateScene({ id, prose, wordCount });
    });
    this.dirtySections.clear();
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
  flushSceneTitle(): void {
    if (this.sceneTitleTimer !== null) {
      clearTimeout(this.sceneTitleTimer);
      this.sceneTitleTimer = null;
    }
    if (this.pendingSceneTitle === null) return;
    const sceneId = this.store.sceneId();
    if (sceneId) this.store.updateScene({ id: sceneId, title: this.pendingSceneTitle });
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
    let currentContent: Record<string, any>[] = [];

    const commit = (id: string, content: Record<string, any>[]) => {
      if (affectedIds.has(id)) {
        const wordCount = countWordsInScene(editor, id);
        this.dirtySections.set(id, {
          prose: { type: 'doc', content },
          wordCount
        });
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
        // Accumulate prose nodes (paragraphs, headings, etc.) for the current scene
        currentContent.push(node);
      }
    }

    // Commit the last scene
    if (currentSceneId) {
      commit(currentSceneId, currentContent);
    }
  }
}
