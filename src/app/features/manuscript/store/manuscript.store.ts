import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Editor } from '@tiptap/core';

import { ElectronService } from '../../../core/services/electron.service';
import { WorkspaceBookStore } from '../../workspace/workspace-book.store';
import { ManuscriptStructureService } from '../../workspace/services/manuscript-structure.service';
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
import { buildScenePatch } from '../helpers/content/manuscript-content.utils';
import { ALLOW_MANUSCRIPT_STRUCTURE_CHANGE_META } from '../extensions/manuscript-editing-guard.extension';

const FORMAT_SETTINGS_STORAGE_KEY = 'manuscript_format_global';

const ACT_HEADER_NODE = 'actHeader';
const CHAPTER_HEADER_NODE = 'chapterHeader';
const SCENE_SUMMARY_NODE = 'sceneSummary';
const SCENE_SKELETON_NODE = 'sceneSkeleton';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  /** Book, act, chapter, or scene ID selected by the current route. */
  activeEntityId: string | null;
  /** Section currently visible in the editor viewport. */
  activeSectionId: string | null;
  mode: ManuscriptMode | null;

  settings: FormattingSettings;
  showFormatMenu: boolean;
  showSummaries: boolean;
  showSceneTitles: boolean;

  editor: Editor | null;

  /** Scene IDs currently represented by lazy-loading skeleton nodes. */
  pendingSkeletonSceneIds: string[];

  /** Scene IDs with prose fetches already in flight. */
  loadingSkeletonSceneIds: string[];

  currentWordCount: number;
}


// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

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
  activeSectionId: null,
  mode: null,

  settings: defaultSettings,
  showFormatMenu: false,
  showSummaries: true,
  showSceneTitles: false,

  editor: null,

  pendingSkeletonSceneIds: [],
  loadingSkeletonSceneIds: [],

  currentWordCount: 0,
};


// ---------------------------------------------------------------------------
// Document Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the ID on the last top-level node whose type matches `typeName`.
 * Insert actions use this to attach a new chapter/scene to the visible parent.
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
 * Deletes a top-level structural section from the editor only. The saver later
 * detects the missing node and commits the physical DB delete after navigation
 * or application close, keeping undo/redo safe.
 */
function deleteNodeRangeInDoc(
  editor: Editor,
  targetType: string,
  id: string,
  stopTypes: string[]
): void {
  const children: Array<{ node: any; from: number; to: number }> = [];

  editor.state.doc.forEach((node, offset) => {
    children.push({ node, from: offset, to: offset + node.nodeSize });
  });

  const targetIdx = children.findIndex(
    child => child.node.type.name === targetType && child.node.attrs['id'] === id
  );

  if (targetIdx === -1) return;

  const from = children[targetIdx].from;
  let to = editor.state.doc.content.size;

  for (let i = targetIdx + 1; i < children.length; i++) {
    if (stopTypes.includes(children[i].node.type.name)) {
      to = children[i].from;
      break;
    }
  }

  let tr = editor.state.tr.delete(from, to);
  tr.setMeta(ALLOW_MANUSCRIPT_STRUCTURE_CHANGE_META, true);

  if (targetType === ACT_HEADER_NODE) {
    tr = decrementFollowingActPositions(tr, from);
  } else if (targetType === CHAPTER_HEADER_NODE) {
    tr = decrementFollowingChapterPositions(tr, from);
  }

  editor.view.dispatch(tr);
}

function decrementFollowingActPositions(tr: any, from: number): any {
  tr.doc.forEach((node: any, offset: number) => {
    if (node.type.name === ACT_HEADER_NODE && offset >= from) {
      const currentPosition = node.attrs['position'] || 0;

      tr = tr.setNodeMarkup(offset, undefined, {
        ...node.attrs,
        position: Math.max(0, currentPosition - 1),
      });
    }
  });

  return tr;
}

function decrementFollowingChapterPositions(tr: any, from: number): any {
  let stopWalk = false;

  tr.doc.forEach((node: any, offset: number) => {
    if (stopWalk || offset < from) return;

    if (node.type.name === ACT_HEADER_NODE) {
      stopWalk = true;
      return;
    }

    if (node.type.name === CHAPTER_HEADER_NODE) {
      const currentPosition = node.attrs['position'] || 0;

      tr = tr.setNodeMarkup(offset, undefined, {
        ...node.attrs,
        position: Math.max(0, currentPosition - 1),
      });
    }
  });

  return tr;
}

function findSkeletonNode(editor: Editor, sceneId: string): { pos: number; nodeSize: number } | null {
  let skeletonPos: number | null = null;
  let skeletonNodeSize = 0;

  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === SCENE_SKELETON_NODE && node.attrs['sceneId'] === sceneId) {
      skeletonPos = offset;
      skeletonNodeSize = node.nodeSize;
    }
  });

  return skeletonPos === null
    ? null
    : { pos: skeletonPos, nodeSize: skeletonNodeSize };
}

function loadStoredSettings(): FormattingSettings {
  const saved = localStorage.getItem(FORMAT_SETTINGS_STORAGE_KEY);

  if (!saved) return defaultSettings;

  try {
    return { ...defaultSettings, ...JSON.parse(saved) };
  } catch (error) {
    console.error('Failed to parse saved formatting settings', error);
    return defaultSettings;
  }
}


// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const ManuscriptStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  withComputed(({ currentWordCount, activeEntityId, activeSectionId, mode }, workspaceBookStore = inject(WorkspaceBookStore)) => ({
    bookHierarchy: computed(() => workspaceBookStore.bookHierarchy()),

    bookId: computed(() => mode() === 'book' ? activeEntityId() : null),
    actId: computed(() => mode() === 'act' ? activeEntityId() : null),
    chapterId: computed(() => mode() === 'chapter' ? activeEntityId() : null),
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

      for (const act of workspaceBookStore.bookHierarchy()) {
        for (const chapter of act.chapters || []) {
          const found = chapter.scenes?.find(scene => scene.id === id);
          if (found) return found.position + 1;
        }
      }

      return null;
    }),

    /**
     * Resolves the parent act/chapter for the active entity so the index rail
     * can highlight all relevant levels at once.
     */
    activeAncestors: computed((): { actId: string | null; chapterId: string | null } => {
      const id = activeSectionId();
      if (!id) return { actId: null, chapterId: null };

      for (const act of workspaceBookStore.bookHierarchy()) {
        for (const chapter of act.chapters || []) {
          if (chapter.scenes?.some(scene => scene.id === id)) {
            return { actId: act.id, chapterId: chapter.id };
          }

          if (chapter.id === id) {
            return { actId: act.id, chapterId: null };
          }
        }

        if (act.id === id) {
          return { actId: null, chapterId: null };
        }
      }

      return { actId: null, chapterId: null };
    }),
  })),

  withMethods((
    store,
    electronService = inject(ElectronService),
    workspaceBookStore = inject(WorkspaceBookStore),
    manuscriptStructureService = inject(ManuscriptStructureService),
  ) => ({

    // -------------------------------------------------------------------------
    // Route / State
    // -------------------------------------------------------------------------

    setRouteParams(mode: ManuscriptMode | null, id: string | null): void {
      patchState(store, {
        mode,
        activeEntityId: id,
        activeSectionId: id,
        settings: loadStoredSettings(),
      });
    },

    setActiveSection(_type: 'act' | 'chapter' | 'scene', id: string): void {
      patchState(store, { activeSectionId: id });
    },

    setEditor(editor: Editor | null): void {
      patchState(store, { editor });
    },


    // -------------------------------------------------------------------------
    // Formatting Settings
    // -------------------------------------------------------------------------

    loadSettings(): void {
      patchState(store, { settings: loadStoredSettings() });
    },

    updateSetting<K extends keyof FormattingSettings>(key: K, value: FormattingSettings[K]): void {
      const newSettings = { ...store.settings(), [key]: value };

      patchState(store, { settings: newSettings });
      localStorage.setItem(FORMAT_SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
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


    // -------------------------------------------------------------------------
    // Data Loading
    // -------------------------------------------------------------------------

    async loadManuscriptData<T extends ManuscriptMode>(mode: T, id: string): Promise<ManuscriptModeDto<T>> {
      Promise.all([
        electronService.invoke('manuscript:getWordCount', { mode, id }),
        workspaceBookStore.loadBookHierarchy(mode, id),
      ])
        .then(([wordCount]) => {
          patchState(store, {
            currentWordCount: wordCount as number,
          });
        })
        .catch(error => console.error('Failed to load stats/hierarchy', error));

      const result = await electronService.invoke('manuscript:get', { mode, id });
      return result as ManuscriptModeDto<T>;
    },

    setPendingSkeletons(sceneIds: string[]): void {
      patchState(store, {
        pendingSkeletonSceneIds: [...sceneIds],
        loadingSkeletonSceneIds: [],
      });
    },

    /**
     * Replaces a lazy scene skeleton with real prose once it enters the viewport.
     * Duplicate observer fires are ignored by the pending/loading guards.
     */
    async loadAndPatchScene(sceneId: string): Promise<void> {
      const pending = store.pendingSkeletonSceneIds();
      const loading = store.loadingSkeletonSceneIds();

      if (!pending.includes(sceneId) || loading.includes(sceneId)) return;

      patchState(store, { loadingSkeletonSceneIds: [...loading, sceneId] });

      try {
        const proseMap: Record<string, TiptapJsonDoc | null> =
          await electronService.invoke('manuscript:getScenesProse', { sceneIds: [sceneId] });

        const editor = store.editor();
        if (!editor) return;

        const skeleton = findSkeletonNode(editor, sceneId);
        if (!skeleton) return;

        const prose = proseMap[sceneId] ?? null;
        const replacement = buildScenePatch(prose);
        const newNodes = replacement.map(nodeJson => editor.schema.nodeFromJSON(nodeJson));

        const { tr } = editor.state;
        tr.replaceWith(skeleton.pos, skeleton.pos + skeleton.nodeSize, newNodes);
        tr.setMeta('addToHistory', false);
        tr.setMeta('skipSaver', true);
        editor.view.dispatch(tr);

        patchState(store, {
          pendingSkeletonSceneIds: store.pendingSkeletonSceneIds().filter(id => id !== sceneId),
          loadingSkeletonSceneIds: store.loadingSkeletonSceneIds().filter(id => id !== sceneId),
        });
      } catch (error) {
        console.error(`[LazyLoad] Failed to patch scene ${sceneId}:`, error);

        patchState(store, {
          loadingSkeletonSceneIds: store.loadingSkeletonSceneIds().filter(id => id !== sceneId),
        });
      }
    },


    // -------------------------------------------------------------------------
    // Atomic Create Methods
    // -------------------------------------------------------------------------

    async createAct(bookId: string): Promise<ActDto> {
      return manuscriptStructureService.createAct(bookId);
    },

    async createChapter(actId: string): Promise<ChapterDto> {
      return manuscriptStructureService.createChapter(actId);
    },

    async createScene(chapterId: string): Promise<SceneDto> {
      return manuscriptStructureService.createScene(chapterId);
    },


    // -------------------------------------------------------------------------
    // Metadata Updates
    // -------------------------------------------------------------------------

    async updateAct(payload: UpdateActPayload): Promise<void> {
      try {
        await manuscriptStructureService.updateAct(payload);

        if (payload.title !== undefined) {
          workspaceBookStore.updateActTitle(payload.id, payload.title);
        }
      } catch (error) {
        console.error('updateAct: IPC call failed', error);
      }
    },

    async updateChapter(payload: UpdateChapterPayload): Promise<void> {
      try {
        await manuscriptStructureService.updateChapter(payload);

        if (payload.title !== undefined) {
          workspaceBookStore.updateChapterTitle(payload.id, payload.title);
        }
      } catch (error) {
        console.error('updateChapter: IPC call failed', error);
      }
    },

    async updateScene(payload: UpdateScenePayload): Promise<void> {
      try {
        await manuscriptStructureService.updateScene(payload);

        if (payload.title !== undefined) {
          workspaceBookStore.updateSceneTitle(payload.id, payload.title);
        }
      } catch (error) {
        console.error('updateScene: IPC call failed', error);
      }
    },


    // -------------------------------------------------------------------------
    // Orchestrated Insert Methods
    // -------------------------------------------------------------------------

    /**
     * Creates Act, Chapter, and Scene records before inserting their nodes.
     * Every inserted data-id is therefore a real persisted UUID.
     */
    async insertAct(): Promise<void> {
      const editor = store.editor();
      const bookId = store.mode() === 'book' ? store.activeEntityId() : null;

      if (!editor) {
        console.warn('insertAct: no editor available');
        return;
      }

      if (!bookId) {
        console.warn('insertAct: no bookId in store');
        return;
      }

      const act = await manuscriptStructureService.createAct(bookId);
      const chapter = await manuscriptStructureService.createChapter(act.id);
      const scene = await manuscriptStructureService.createScene(chapter.id);

      const endPosition = editor.state.doc.content.size;

      editor.chain().focus().command(({ tr }) => {
        tr.setMeta(ALLOW_MANUSCRIPT_STRUCTURE_CHANGE_META, true);
        return true;
      }).insertContentAt(endPosition, [
        { type: ACT_HEADER_NODE, attrs: { id: act.id, title: act.title, position: act.position } },
        { type: CHAPTER_HEADER_NODE, attrs: { id: chapter.id, title: chapter.title, position: chapter.position } },
        { type: SCENE_SUMMARY_NODE, attrs: { id: scene.id, title: scene.title, summary: scene.summary, position: scene.position } },
        { type: 'paragraph' },
      ], { updateSelection: true }).run();
    },

    async insertChapter(): Promise<void> {
      const editor = store.editor();

      if (!editor) {
        console.warn('insertChapter: no editor available');
        return;
      }

      const actId = getLastNodeId(editor, ACT_HEADER_NODE);

      if (!actId) {
        console.warn('insertChapter: no act found in document');
        return;
      }

      const chapter = await manuscriptStructureService.createChapter(actId);
      const scene = await manuscriptStructureService.createScene(chapter.id);

      const endPosition = editor.state.doc.content.size;

      editor.chain().focus().command(({ tr }) => {
        tr.setMeta(ALLOW_MANUSCRIPT_STRUCTURE_CHANGE_META, true);
        return true;
      }).insertContentAt(endPosition, [
        { type: CHAPTER_HEADER_NODE, attrs: { id: chapter.id, title: chapter.title, position: chapter.position } },
        { type: SCENE_SUMMARY_NODE, attrs: { id: scene.id, title: scene.title, summary: scene.summary, position: scene.position } },
        { type: 'paragraph' },
      ], { updateSelection: true }).run();
    },

    async insertScene(): Promise<void> {
      const editor = store.editor();

      if (!editor) {
        console.warn('insertScene: no editor available');
        return;
      }

      const chapterId = getLastNodeId(editor, CHAPTER_HEADER_NODE);

      if (!chapterId) {
        console.warn('insertScene: no chapter found in document');
        return;
      }

      const scene = await manuscriptStructureService.createScene(chapterId);
      const endPosition = editor.state.doc.content.size;

      editor.chain().focus().command(({ tr }) => {
        tr.setMeta(ALLOW_MANUSCRIPT_STRUCTURE_CHANGE_META, true);
        return true;
      }).insertContentAt(endPosition, [
        { type: SCENE_SUMMARY_NODE, attrs: { id: scene.id, title: scene.title, summary: scene.summary, position: scene.position } },
        { type: 'paragraph' },
      ], { updateSelection: true }).run();
    },


    // -------------------------------------------------------------------------
    // Logical Delete Methods
    // -------------------------------------------------------------------------

    deleteAct(id: string): void {
      const editor = store.editor();
      if (!editor) return;

      deleteNodeRangeInDoc(editor, ACT_HEADER_NODE, id, [ACT_HEADER_NODE]);
    },

    deleteChapter(id: string): void {
      const editor = store.editor();
      if (!editor) return;

      deleteNodeRangeInDoc(editor, CHAPTER_HEADER_NODE, id, [CHAPTER_HEADER_NODE, ACT_HEADER_NODE]);
    },

    deleteScene(id: string): void {
      const editor = store.editor();
      if (!editor) return;

      deleteNodeRangeInDoc(editor, SCENE_SUMMARY_NODE, id, [SCENE_SUMMARY_NODE, CHAPTER_HEADER_NODE, ACT_HEADER_NODE]);
    },
  }))
);
