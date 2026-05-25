import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { Editor } from '@tiptap/core';
import { ElectronService } from '../../../core/services/electron.service';
import { ManuscriptMode, ManuscriptModeDto, ActDto, ChapterDto, SceneDto, UpdateActPayload, UpdateChapterPayload, UpdateScenePayload } from '../../../../../shared/models/manuscript.model';
import { inject } from '@angular/core';

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
  bookId: string | null;
  actId: string | null;
  chapterId: string | null;
  sceneId: string | null;
  mode: ManuscriptMode | null;
  settings: FormattingSettings;
  showFormatMenu: boolean;
  showSummaries: boolean;
  showSceneTitles: boolean;
  editor: Editor | null;
}

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
  bookId: null,
  actId: null,
  chapterId: null,
  sceneId: null,
  mode: null,
  settings: defaultSettings,
  showFormatMenu: false,
  showSummaries: true,
  showSceneTitles: false,
  editor: null,
};

// ---------------------------------------------------------------------------
// Module-level helpers (no Angular DI needed)
// ---------------------------------------------------------------------------

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
 *   Act    → stop at next actHeader
 *   Chapter → stop at next chapterHeader or actHeader
 *   Scene  → stop at next sceneSummary, chapterHeader, or actHeader
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
  if (targetIdx === -1) return; // node not found – nothing to remove

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
    // For Acts: decrement position of all subsequent actHeaders in the document
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
    // We walk forward from the deletion point 'from', updating chapters,
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const ManuscriptStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, electronService = inject(ElectronService)) => ({

    // -----------------------------------------------------------------------
    // Route / state setters
    // -----------------------------------------------------------------------

    setRouteParams(mode: ManuscriptMode | null, id: string | null) {
      patchState(store, {
        mode,
        bookId: mode === 'book' ? id : null,
        actId: mode === 'act' ? id : null,
        chapterId: mode === 'chapter' ? id : null,
        sceneId: mode === 'scene' ? id : null,
      });
      this.loadSettings();
    },

    setBookId(id: string | null) {
      // Deprecated in favor of setRouteParams, kept for compatibility if needed elsewhere
      patchState(store, { bookId: id });
      this.loadSettings();
    },

    setActiveSection(type: 'act' | 'chapter' | 'scene', id: string) {
      if (type === 'act') patchState(store, { actId: id });
      else if (type === 'chapter') patchState(store, { chapterId: id });
      else if (type === 'scene') patchState(store, { sceneId: id });
    },

    setEditor(editor: Editor | null) {
      patchState(store, { editor });
    },

    // -----------------------------------------------------------------------
    // Settings
    // -----------------------------------------------------------------------

    loadSettings() {
      const saved = localStorage.getItem('manuscript_format_global');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Merging parsed settings with defaultSettings ensures that if new settings
          // are introduced to the app in future updates, they will fallback to their
          // default values instead of being undefined when loaded from an older storage format.
          patchState(store, { settings: { ...defaultSettings, ...parsed } });
        } catch (e) {
          console.error('Failed to parse saved formatting settings', e);
        }
      } else {
        patchState(store, { settings: defaultSettings });
      }
    },

    // K is a generic type representing a key of FormattingSettings.
    // FormattingSettings[K] resolves to the specific type corresponding to that key (e.g. number for fontSize).
    // This gives compile-time type safety for key-value pair updates.
    updateSetting<K extends keyof FormattingSettings>(key: K, value: FormattingSettings[K]) {
      const newSettings = { ...store.settings(), [key]: value };
      patchState(store, { settings: newSettings });
      localStorage.setItem('manuscript_format_global', JSON.stringify(newSettings));
    },

    toggleFormatMenu() {
      patchState(store, { showFormatMenu: !store.showFormatMenu() });
    },

    toggleSummaries() {
      patchState(store, { showSummaries: !store.showSummaries() });
    },

    toggleSceneTitles() {
      patchState(store, { showSceneTitles: !store.showSceneTitles() });
    },

    // -----------------------------------------------------------------------
    // Data fetching
    // -----------------------------------------------------------------------

    async loadManuscriptData<T extends ManuscriptMode>(mode: T, id: string): Promise<ManuscriptModeDto<T>> {
      const result = await electronService.invoke('manuscript:get', { mode, id });
      return result as ManuscriptModeDto<T>;
    },

    // -----------------------------------------------------------------------
    // Atomic create primitives (single entity, returns persisted DTO)
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // Update methods
    // -----------------------------------------------------------------------

    async updateAct(payload: UpdateActPayload): Promise<void> {
      try {
        await electronService.invoke('manuscript:updateAct', payload);
      } catch (error) {
        console.error('updateAct: IPC call failed', error);
      }
    },

    async updateChapter(payload: UpdateChapterPayload): Promise<void> {
      try {
        await electronService.invoke('manuscript:updateChapter', payload);
      } catch (error) {
        console.error('updateChapter: IPC call failed', error);
      }
    },

    async updateScene(payload: UpdateScenePayload): Promise<void> {
      try {
        await electronService.invoke('manuscript:updateScene', payload);
      } catch (error) {
        console.error('updateScene: IPC call failed', error);
      }
    },

    // -----------------------------------------------------------------------
    // Orchestrated insert methods
    // Cascade rules:
    //   insertAct    → creates Act + Chapter (inside act) + Scene (inside chapter)
    //   insertChapter → creates Chapter (inside last act) + Scene (inside chapter)
    //   insertScene  → creates Scene (inside last chapter)
    // All entities are persisted before being inserted into the Tiptap document,
    // so every data-id attribute is a real DB UUID, never a temporary value.
    // -----------------------------------------------------------------------

    async insertAct(): Promise<void> {
      const editor = store.editor();
      const bookId = store.bookId();
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
        { type: 'paragraph' }
      ]).run();
    },

    async insertChapter(): Promise<void> {
      const editor = store.editor();
      if (!editor) { console.warn('insertChapter: no editor available'); return; }

      // Attach to the last act visible in the document
      const actId = getLastNodeId(editor, 'actHeader');
      if (!actId) { console.warn('insertChapter: no act found in document'); return; }

      // Sequential DB writes: Chapter → Scene
      const chapter = await electronService.invoke('manuscript:createChapter', { actId }) as ChapterDto;
      const scene = await electronService.invoke('manuscript:createScene', { chapterId: chapter.id }) as SceneDto;

      const endPosition = editor.state.doc.content.size;
      editor.chain().focus().insertContentAt(endPosition, [
        { type: 'chapterHeader', attrs: { id: chapter.id, title: chapter.title, position: chapter.position } },
        { type: 'sceneSummary', attrs: { id: scene.id, title: scene.title, summary: scene.summary, position: scene.position } },
        { type: 'paragraph' }
      ]).run();
    },

    async insertScene(): Promise<void> {
      const editor = store.editor();
      if (!editor) { console.warn('insertScene: no editor available'); return; }

      // Attach to the last chapter visible in the document
      const chapterId = getLastNodeId(editor, 'chapterHeader');
      if (!chapterId) { console.warn('insertScene: no chapter found in document'); return; }

      const scene = await electronService.invoke('manuscript:createScene', { chapterId }) as SceneDto;

      const endPosition = editor.state.doc.content.size;
      editor.chain().focus().insertContentAt(endPosition, [
        { type: 'sceneSummary', attrs: { id: scene.id, title: scene.title, summary: scene.summary, position: scene.position } },
        { type: 'paragraph' }
      ]).run();
    },

    // -----------------------------------------------------------------------
    // Delete methods
    // Each method: (1) persists the deletion to the DB via IPC,
    // (2) removes the corresponding node(s) from the Tiptap document.
    // DB cascade (onDelete: 'cascade') handles child rows automatically.
    // -----------------------------------------------------------------------

    async deleteAct(id: string): Promise<void> {
      try {
        await electronService.invoke('manuscript:deleteAct', { id });
      } catch (error) {
        console.error('deleteAct: IPC call failed', error);
        return;
      }
      const editor = store.editor();
      if (editor) {
        // Remove from this actHeader to the next actHeader (or end of doc).
        deleteNodeRangeInDoc(editor, 'actHeader', id, ['actHeader']);
      }
    },

    async deleteChapter(id: string): Promise<void> {
      try {
        await electronService.invoke('manuscript:deleteChapter', { id });
      } catch (error) {
        console.error('deleteChapter: IPC call failed', error);
        return;
      }
      const editor = store.editor();
      if (editor) {
        // Remove from this chapterHeader to the next chapter or act boundary.
        deleteNodeRangeInDoc(editor, 'chapterHeader', id, ['chapterHeader', 'actHeader']);
      }
    },

    async deleteScene(id: string): Promise<void> {
      try {
        await electronService.invoke('manuscript:deleteScene', { id });
      } catch (error) {
        console.error('deleteScene: IPC call failed', error);
        return;
      }
      const editor = store.editor();
      if (editor) {
        // Remove from this sceneSummary to the next scene/chapter/act boundary.
        deleteNodeRangeInDoc(editor, 'sceneSummary', id, ['sceneSummary', 'chapterHeader', 'actHeader']);
      }
    },
  }))
);
