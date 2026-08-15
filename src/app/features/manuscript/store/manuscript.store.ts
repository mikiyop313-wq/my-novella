import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Editor } from '@tiptap/core';

import { ElectronService } from '../../../core/services/electron.service';
import { buildScenePatch } from '../helpers/content/manuscript-content.utils';
import {
  ActDto,
  ChapterDto,
  ManuscriptMode,
  ManuscriptModeDto,
  SceneDto,
  TiptapJsonDoc,
  UpdateActPayload,
  UpdateChapterPayload,
  UpdateScenePayload,
} from '../../../../../shared/models/manuscript.model';


// ─────────────────────────────────────────────────────────────────────────────
// Interfaces & Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FormattingSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  textIndent: number;
  pageWidth: 'narrow' | 'medium' | 'wide';
}

export interface ManuscriptState {
  /** The ID of the currently active entity (book, act, chapter, or scene). */
  activeEntityId: string | null;
  mode: ManuscriptMode | null;

  settings: FormattingSettings;
  showFormatMenu: boolean;
  showSummaries: boolean;
  showSceneTitles: boolean;

  editor: Editor | null;

  /** Scene IDs currently rendered as skeleton nodes (not yet loaded). */
  pendingSkeletonSceneIds: string[];

  /** Scene IDs whose prose fetch is currently in-flight (prevents duplicate calls). */
  loadingSkeletonSceneIds: string[];

  bookHierarchy: ActDto[];
  currentWordCount: number;
}


// ─────────────────────────────────────────────────────────────────────────────
// Default values
// ─────────────────────────────────────────────────────────────────────────────

const defaultSettings: FormattingSettings = {
  fontFamily: "'Merriweather', serif",
  fontSize: 18,
  lineHeight: 1.8,
  paragraphSpacing: 24,
  textAlign: 'left',
  textIndent: 0,
  pageWidth: 'medium',
};

const initialState: ManuscriptState = {
  activeEntityId: null,
  mode: null,

  settings: defaultSettings,
  showFormatMenu: false,
  showSummaries: true,
  showSceneTitles: false,

  editor: null,

  pendingSkeletonSceneIds: [],
  loadingSkeletonSceneIds: [],

  bookHierarchy: [],
  currentWordCount: 0,
};


// ─────────────────────────────────────────────────────────────────────────────
// Module-level helpers (no Angular DI needed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Walks the Tiptap document and returns the `id` attribute of the
 * LAST node whose type name matches `typeName`.
 * Returns null if no matching node is found.
 */
function getLastNodeId(editor: Editor, typeName: string): string | null {
  let lastId: string | null = null;

  editor.state.doc.descendants(node => {
    if (node.type.name === typeName && node.attrs['id']) {
      lastId = node.attrs['id'];
    }
  });

  return lastId;
}

/**
 * Deletes a range of top-level Tiptap nodes starting from the node matching
 * `targetType` + `id`, up to (but not including) the first subsequent node
 * whose type is in `stopTypes`. If no stop node is found the range extends
 * to the end of the document.
 *
 * This mirrors the DB cascade behaviour:
 *   Act     → stop at next actHeader
 *   Chapter → stop at next chapterHeader or actHeader
 *   Scene   → stop at next sceneSummary, chapterHeader, or actHeader
 */
function deleteNodeRangeInDoc(
  editor: Editor,
  targetType: string,
  id: string,
  stopTypes: string[]
): void {
  // Collect every direct child of the document with its absolute position.
  const children: Array<{ node: any; from: number; to: number }> = [];

  editor.state.doc.forEach((node, offset) => {
    children.push({ node, from: offset, to: offset + node.nodeSize });
  });

  const targetIdx = children.findIndex(
    c => c.node.type.name === targetType && c.node.attrs['id'] === id
  );

  if (targetIdx === -1) return; // node not found — nothing to remove

  const from = children[targetIdx].from;

  // Walk forward until we hit a stop-type node (exclusive boundary).
  let to = editor.state.doc.content.size;

  for (let i = targetIdx + 1; i < children.length; i++) {
    if (stopTypes.includes(children[i].node.type.name)) {
      to = children[i].from;
      break;
    }
  }

  // Create the deletion transaction.
  let tr = editor.state.tr.delete(from, to);

  // Update the position attributes of subsequent sibling nodes in the new document draft.
  if (targetType === 'actHeader') {
    // For Acts: decrement position of all subsequent actHeaders in the document.
    tr.doc.forEach((node, offset) => {
      if (node.type.name === 'actHeader' && offset >= from) {
        const currentPos = node.attrs['position'] || 0;
        tr = tr.setNodeMarkup(offset, undefined, {
          ...node.attrs,
          position: Math.max(0, currentPos - 1),
        });
      }
    });

  } else if (targetType === 'chapterHeader') {
    // For Chapters: decrement position of subsequent chapters in the same act.
    // Walk forward from the deletion point, updating chapters,
    // and stop when we encounter the next actHeader.
    let stopWalk = false;

    tr.doc.forEach((node, offset) => {
      if (stopWalk) return;

      if (offset >= from) {
        if (node.type.name === 'actHeader') {
          stopWalk = true;
        } else if (node.type.name === 'chapterHeader') {
          const currentPos = node.attrs['position'] || 0;
          tr = tr.setNodeMarkup(offset, undefined, {
            ...node.attrs,
            position: Math.max(0, currentPos - 1),
          });
        }
      }
    });
  }

  editor.view.dispatch(tr);
}


// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const ManuscriptStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  withComputed(({ currentWordCount, bookHierarchy, activeEntityId, mode }) => ({

    /** Derived ID – non-null only when mode is 'book'. */
    bookId: computed(() => mode() === 'book' ? activeEntityId() : null),
    /** Derived ID – non-null only when mode is 'act'. */
    actId: computed(() => mode() === 'act' ? activeEntityId() : null),
    /** Derived ID – non-null only when mode is 'chapter'. */
    chapterId: computed(() => mode() === 'chapter' ? activeEntityId() : null),
    /** Derived ID – non-null only when mode is 'scene'. */
    sceneId: computed(() => mode() === 'scene' ? activeEntityId() : null),

    estimatedPages: computed(() =>
      Math.max(1, Math.ceil(currentWordCount() / 250))
    ),

    estimatedReadTime: computed(() =>
      Math.max(1, Math.ceil(currentWordCount() / 200))
    ),

    sceneNumber: computed(() => {
      if (mode() !== 'scene') return null;
      const id = activeEntityId();
      if (!id) return null;

      for (const act of bookHierarchy()) {
        for (const chapter of act.chapters || []) {
          const found = chapter.scenes?.find(s => s.id === id);
          if (found) return found.position + 1; // position is 0-based in the model
        }
      }

      return null;
    }),

    /**
     * Resolves the ancestor chain for the currently active entity.
     * When a scene is active while in book mode, returns the IDs of the
     * chapter and act that contain it so the index scroll can highlight all
     * three levels simultaneously.
     */
    activeAncestors: computed((): { actId: string | null; chapterId: string | null } => {
      const id = activeEntityId();
      if (!id) return { actId: null, chapterId: null };

      for (const act of bookHierarchy()) {
        for (const chapter of act.chapters || []) {
          // Active entity is a scene inside this chapter
          if (chapter.scenes?.some(s => s.id === id)) {
            return { actId: act.id, chapterId: chapter.id };
          }
          // Active entity is this chapter itself
          if (chapter.id === id) {
            return { actId: act.id, chapterId: null };
          }
        }
        // Active entity is this act itself
        if (act.id === id) {
          return { actId: null, chapterId: null };
        }
      }

      return { actId: null, chapterId: null };
    }),

  })),

  withMethods((store, electronService = inject(ElectronService)) => ({

    // ── Route / state setters ──────────────────────────────────────────────

    setRouteParams(mode: ManuscriptMode | null, id: string | null): void {
      patchState(store, { mode, activeEntityId: id });
      this.loadSettings();
    },

    setActiveSection(_type: 'act' | 'chapter' | 'scene', id: string): void {
      patchState(store, { activeEntityId: id });
    },

    setEditor(editor: Editor | null): void {
      patchState(store, { editor });
    },


    // ── Settings ──────────────────────────────────────────────────────────

    loadSettings(): void {
      const saved = localStorage.getItem('manuscript_format_global');

      if (!saved) {
        patchState(store, { settings: defaultSettings });
        return;
      }

      try {
        const parsed = JSON.parse(saved);
        // Merging with defaultSettings ensures future keys fall back gracefully
        // when loaded from an older storage format.
        patchState(store, { settings: { ...defaultSettings, ...parsed } });
      } catch (e) {
        console.error('Failed to parse saved formatting settings', e);
      }
    },

    /**
     * Updates a single formatting setting and persists the full settings object.
     *
     * `K` is constrained to a key of `FormattingSettings`, so the `value`
     * parameter is narrowed to the correct type at compile-time.
     */
    updateSetting<K extends keyof FormattingSettings>(key: K, value: FormattingSettings[K]): void {
      const newSettings = { ...store.settings(), [key]: value };
      patchState(store, { settings: newSettings });
      localStorage.setItem('manuscript_format_global', JSON.stringify(newSettings));
    },

    toggleFormatMenu(): void {
      patchState(store, { showFormatMenu: !store.showFormatMenu() });
    },

    toggleSummaries(): void {
      patchState(store, { showSummaries: !store.showSummaries() });
    },

    toggleSceneTitles(): void {
      patchState(store, { showSceneTitles: !store.showSceneTitles() });
    },


    // ── Data fetching ─────────────────────────────────────────────────────

    async loadManuscriptData<T extends ManuscriptMode>(mode: T, id: string): Promise<ManuscriptModeDto<T>> {
      Promise.all([
        electronService.invoke('manuscript:getWordCount', { mode, id }),
        electronService.invoke('manuscript:getBookHierarchy', { mode, id }),
      ])
        .then(([wordCount, hierarchy]) => {
          patchState(store, {
            currentWordCount: wordCount as number,
            bookHierarchy: hierarchy as ActDto[],
          });
        })
        .catch(err => console.error('Failed to load stats/hierarchy', err));

      const result = await electronService.invoke('manuscript:get', { mode, id });
      return result as ManuscriptModeDto<T>;
    },

    /**
     * Sets the list of scene IDs currently represented as skeleton nodes in the
     * document. Called by the Manuscript component after each content load so
     * the store knows which scenes still need fetching.
     */
    setPendingSkeletons(sceneIds: string[]): void {
      patchState(store, {
        pendingSkeletonSceneIds: [...sceneIds],
        loadingSkeletonSceneIds: [],
      });
    },

    /**
     * Fetches the prose for a single skeleton scene and patches it into the
     * ProseMirror document, replacing the `sceneSkeleton` node with real content.
     *
     * Guards:
     * - Skips if the scene is not in the pending list (already loaded or unknown)
     * - Skips if a fetch for this scene is already in-flight
     */
    async loadAndPatchScene(sceneId: string): Promise<void> {
      const pending = store.pendingSkeletonSceneIds();
      const loading = store.loadingSkeletonSceneIds();

      if (!pending.includes(sceneId)) return;
      if (loading.includes(sceneId)) return;

      // Mark as in-flight
      patchState(store, { loadingSkeletonSceneIds: [...loading, sceneId] });

      try {
        const proseMap: Record<string, TiptapJsonDoc | null> =
          await electronService.invoke('manuscript:getScenesProse', { sceneIds: [sceneId] });

        const editor = store.editor();
        if (!editor) return;

        const prose = proseMap[sceneId] ?? null;
        const replacement = buildScenePatch(prose);

        // Find the sceneSkeleton node for this sceneId in the document.
        let skeletonPos: number | null = null;
        let skeletonNodeSize = 0;

        editor.state.doc.forEach((node, offset) => {
          if (node.type.name === 'sceneSkeleton' && node.attrs['sceneId'] === sceneId) {
            skeletonPos = offset;
            skeletonNodeSize = node.nodeSize;
          }
        });

        if (skeletonPos === null) return; // already replaced (e.g. duplicate observer fire)

        // Build replacement nodes from the fetched prose.
        const newNodes = replacement.map(nodeJson => editor.schema.nodeFromJSON(nodeJson));

        // Replace the skeleton node with real prose.
        // addToHistory: false — the user cannot undo back to a skeleton state.
        const { tr } = editor.state;
        tr.replaceWith(skeletonPos, skeletonPos + skeletonNodeSize, newNodes);
        tr.setMeta('addToHistory', false);
        tr.setMeta('skipSaver', true);
        editor.view.dispatch(tr);

        // Remove from both tracking lists.
        patchState(store, {
          pendingSkeletonSceneIds: store.pendingSkeletonSceneIds().filter(id => id !== sceneId),
          loadingSkeletonSceneIds: store.loadingSkeletonSceneIds().filter(id => id !== sceneId),
        });

      } catch (error) {
        console.error(`[LazyLoad] Failed to patch scene ${sceneId}:`, error);
        // Remove from in-flight list so the observer can retry on next intersection.
        patchState(store, {
          loadingSkeletonSceneIds: store.loadingSkeletonSceneIds().filter(id => id !== sceneId),
        });
      }
    },


    // ── Atomic create primitives (single entity, returns persisted DTO) ───

    async createAct(bookId: string): Promise<ActDto> {
      const result = await electronService.invoke('manuscript:createAct', { bookId });
      return result as ActDto;
    },

    async createChapter(actId: string): Promise<ChapterDto> {
      const result = await electronService.invoke('manuscript:createChapter', { actId });
      return result as ChapterDto;
    },

    async createScene(chapterId: string): Promise<SceneDto> {
      const result = await electronService.invoke('manuscript:createScene', { chapterId });
      return result as SceneDto;
    },


    // ── Update methods ────────────────────────────────────────────────────

    async updateAct(payload: UpdateActPayload): Promise<void> {
      try {
        await electronService.invoke('manuscript:updateAct', payload);

        // Reflect the title change in the local hierarchy so computed signals
        // (e.g. currentHeaderTitle in the toolbar) react immediately.
        if (payload.title !== undefined) {
          patchState(store, {
            bookHierarchy: store.bookHierarchy().map(act =>
              act.id === payload.id ? { ...act, title: payload.title! } : act
            ),
          });
        }
      } catch (error) {
        console.error('updateAct: IPC call failed', error);
      }
    },

    async updateChapter(payload: UpdateChapterPayload): Promise<void> {
      try {
        await electronService.invoke('manuscript:updateChapter', payload);

        // Reflect the title change in the local hierarchy.
        if (payload.title !== undefined) {
          patchState(store, {
            bookHierarchy: store.bookHierarchy().map(act => ({
              ...act,
              chapters: (act.chapters || []).map(ch =>
                ch.id === payload.id ? { ...ch, title: payload.title! } : ch
              ),
            })),
          });
        }
      } catch (error) {
        console.error('updateChapter: IPC call failed', error);
      }
    },

    async updateScene(payload: UpdateScenePayload): Promise<void> {
      try {
        await electronService.invoke('manuscript:updateScene', payload);

        // Reflect the title change in the local hierarchy.
        if (payload.title !== undefined) {
          patchState(store, {
            bookHierarchy: store.bookHierarchy().map(act => ({
              ...act,
              chapters: (act.chapters || []).map(ch => ({
                ...ch,
                scenes: (ch.scenes || []).map(sc =>
                  sc.id === payload.id ? { ...sc, title: payload.title! } : sc
                ),
              })),
            })),
          });
        }
      } catch (error) {
        console.error('updateScene: IPC call failed', error);
      }
    },


    // ── Orchestrated insert methods ───────────────────────────────────────
    //
    // Cascade rules:
    //   insertAct     → creates Act + Chapter (inside act) + Scene (inside chapter)
    //   insertChapter → creates Chapter (inside last act) + Scene (inside chapter)
    //   insertScene   → creates Scene (inside last chapter)
    //
    // All entities are persisted before being inserted into the Tiptap document,
    // so every data-id attribute is a real DB UUID, never a temporary value.

    async insertAct(): Promise<void> {
      const editor = store.editor();
      const bookId = store.mode() === 'book' ? store.activeEntityId() : null;

      if (!editor) { console.warn('insertAct: no editor available'); return; }
      if (!bookId) { console.warn('insertAct: no bookId in store'); return; }

      // Sequential DB writes: Act → Chapter → Scene
      const act = await electronService.invoke('manuscript:createAct', { bookId }) as ActDto;
      const chapter = await electronService.invoke('manuscript:createChapter', { actId: act.id }) as ChapterDto;
      const scene = await electronService.invoke('manuscript:createScene', { chapterId: chapter.id }) as SceneDto;

      const endPosition = editor.state.doc.content.size;

      editor.chain().focus().insertContentAt(endPosition, [
        { type: 'actHeader', attrs: { id: act.id, title: act.title, position: act.position } },
        { type: 'chapterHeader', attrs: { id: chapter.id, title: chapter.title, position: chapter.position } },
        { type: 'sceneSummary', attrs: { id: scene.id, title: scene.title, summary: scene.summary, position: scene.position } },
        { type: 'paragraph' },
      ]).run();
    },

    async insertChapter(): Promise<void> {
      const editor = store.editor();
      if (!editor) { console.warn('insertChapter: no editor available'); return; }

      // Attach to the last act visible in the document.
      const actId = getLastNodeId(editor, 'actHeader');
      if (!actId) { console.warn('insertChapter: no act found in document'); return; }

      // Sequential DB writes: Chapter → Scene
      const chapter = await electronService.invoke('manuscript:createChapter', { actId }) as ChapterDto;
      const scene = await electronService.invoke('manuscript:createScene', { chapterId: chapter.id }) as SceneDto;

      const endPosition = editor.state.doc.content.size;

      editor.chain().focus().insertContentAt(endPosition, [
        { type: 'chapterHeader', attrs: { id: chapter.id, title: chapter.title, position: chapter.position } },
        { type: 'sceneSummary', attrs: { id: scene.id, title: scene.title, summary: scene.summary, position: scene.position } },
        { type: 'paragraph' },
      ]).run();
    },

    async insertScene(): Promise<void> {
      const editor = store.editor();
      if (!editor) { console.warn('insertScene: no editor available'); return; }

      // Attach to the last chapter visible in the document.
      const chapterId = getLastNodeId(editor, 'chapterHeader');
      if (!chapterId) { console.warn('insertScene: no chapter found in document'); return; }

      const scene = await electronService.invoke('manuscript:createScene', { chapterId }) as SceneDto;

      const endPosition = editor.state.doc.content.size;

      editor.chain().focus().insertContentAt(endPosition, [
        { type: 'sceneSummary', attrs: { id: scene.id, title: scene.title, summary: scene.summary, position: scene.position } },
        { type: 'paragraph' },
      ]).run();
    },


    // ── Logical delete methods (editor only, undo/redo safe) ──────────────
    //
    // These methods only remove node(s) from the Tiptap document.
    // They do NOT touch the database. The actual IPC deletion is deferred:
    // `ManuscriptProseSaverService.cacheDeletedSections` detects the missing
    // nodes via `onDocumentChanged` and queues them in `pendingDeletes`.
    // `flushStructuralChanges` (called on navigation / app close) then calls
    // the physical delete methods below to commit the changes to the DB.
    //
    // This design makes undo/redo safe:
    //   Undo  → nodes reappear → `cancelRestoredSections` removes from queue
    //   Redo  → nodes vanish   → `cacheDeletedSections` re-queues them
    //   Never → DB is touched before the user commits to the change.

    deleteAct(id: string): void {
      const editor = store.editor();
      if (!editor) return;
      // Remove from this actHeader to the next actHeader (or end of doc).
      deleteNodeRangeInDoc(editor, 'actHeader', id, ['actHeader']);
    },

    deleteChapter(id: string): void {
      const editor = store.editor();
      if (!editor) return;
      // Remove from this chapterHeader to the next chapter or act boundary.
      deleteNodeRangeInDoc(editor, 'chapterHeader', id, ['chapterHeader', 'actHeader']);
    },

    deleteScene(id: string): void {
      const editor = store.editor();
      if (!editor) return;
      // Remove from this sceneSummary to the next scene/chapter/act boundary.
      deleteNodeRangeInDoc(editor, 'sceneSummary', id, ['sceneSummary', 'chapterHeader', 'actHeader']);
    },

  }))
);
