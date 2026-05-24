import { Injectable, inject } from '@angular/core';
import { Editor } from '@tiptap/core';
import { ManuscriptStore } from '../store/manuscript.store';

type SectionType = 'act' | 'chapter' | 'scene';

interface DirtySection {
  type: SectionType;
  prose: string;
}

/** Header tag names as they appear in the serialized HTML. */
const HEADER_TAGS = new Set(['act-header', 'chapter-header', 'scene-summary']);

/** ProseMirror node type names that mark structural section boundaries. */
const HEADER_NODE_TYPES = new Set(['actHeader', 'chapterHeader', 'sceneSummary']);

function tagToSectionType(tag: string): SectionType {
  if (tag === 'act-header') return 'act';
  if (tag === 'chapter-header') return 'chapter';
  return 'scene';
}

@Injectable({ providedIn: 'root' })
export class ManuscriptProseSaverService {
  private readonly store = inject(ManuscriptStore);

  // ── Prose dirty-section tracking ─────────────────────────────────────────
  private dirtySections = new Map<string, DirtySection>();
  private proseDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Scene title debounce ─────────────────────────────────────────────────
  private pendingSceneTitle: string | null = null;
  private sceneTitleTimer: ReturnType<typeof setTimeout> | null = null;

  // ────────────────────────────────────────────────────────────────────────
  // Prose auto-save
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Called on every Tiptap `onUpdate` where `docChanged` is true.
   * Inspects the transaction steps to identify the affected section,
   * snapshots its prose HTML, and schedules a debounced DB write.
   */
  onDocumentChanged(transaction: any, editor: Editor): void {
    const affectedIds = this.findAffectedSectionIds(transaction, editor);
    if (affectedIds.size === 0) return;

    this.snapshotDirtySections(affectedIds, editor);

    if (this.proseDebounceTimer !== null) clearTimeout(this.proseDebounceTimer);
    this.proseDebounceTimer = setTimeout(() => this.flushDirtySections(), 2000);
  }

  /** Persists all dirty sections immediately and clears the queue. */
  flushDirtySections(): void {
    if (this.proseDebounceTimer !== null) {
      clearTimeout(this.proseDebounceTimer);
      this.proseDebounceTimer = null;
    }
    this.dirtySections.forEach(({ type, prose }, id) => {
      if (type === 'act') this.store.updateAct({ id, prose });
      else if (type === 'chapter') this.store.updateChapter({ id, prose });
      else if (type === 'scene') this.store.updateScene({ id, prose });
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
   * Walks the transaction steps to find the IDs of the structural sections
   * (act / chapter / scene) that contain the changed positions.
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

      // Walk backwards to find the nearest section header before this position.
      for (let i = children.length - 1; i >= 0; i--) {
        const { node, from } = children[i];
        if (from > pos) continue;
        if (HEADER_NODE_TYPES.has(node.type.name) && node.attrs['id']) {
          affectedIds.add(node.attrs['id']);
          break;
        }
      }
    }

    return affectedIds;
  }

  /**
   * Parses the editor HTML and records the prose content for each section
   * whose ID is in `affectedIds`, updating `dirtySections`.
   */
  private snapshotDirtySections(affectedIds: Set<string>, editor: Editor): void {
    const div = document.createElement('div');
    div.innerHTML = editor.getHTML();

    let currentId: string | null = null;
    let currentType: SectionType | null = null;
    let currentHtml = '';

    const commit = (id: string, type: SectionType, html: string) => {
      if (affectedIds.has(id)) {
        this.dirtySections.set(id, { type, prose: html });
      }
    };

    Array.from(div.children).forEach(child => {
      const tag = child.tagName.toLowerCase();
      if (HEADER_TAGS.has(tag)) {
        if (currentId && currentType) commit(currentId, currentType, currentHtml);
        currentId = child.getAttribute('data-id');
        currentType = tagToSectionType(tag);
        currentHtml = '';
      } else if (currentId) {
        currentHtml += child.outerHTML;
      }
    });

    if (currentId && currentType) commit(currentId, currentType, currentHtml);
  }
}
