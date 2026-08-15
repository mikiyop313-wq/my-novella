import { Editor } from '@tiptap/core';

import {
  ActDto,
  ChapterDto,
  ManuscriptDataDto,
  ManuscriptMode,
  SceneDto,
  TiptapJsonDoc,
  TiptapNode,
} from '../../../../../../shared/models/manuscript.model';

/**
 * Number of scenes whose prose is included immediately on load. Remaining
 * scenes render as skeleton nodes and fetch their prose when scrolled into view.
 */
export const INITIAL_SCENE_COUNT = 3;


// ---------------------------------------------------------------------------
// Editor Document Builders
// ---------------------------------------------------------------------------

/**
 * Builds a full Tiptap JSON document from manuscript DTOs.
 * Lazy loading uses `buildEditorContentLazy` below.
 */
export function buildEditorContent(mode: ManuscriptMode, data: ManuscriptDataDto): TiptapJsonDoc {
  const content: TiptapNode[] = [];

  if (mode === 'book') {
    (data as ActDto[]).forEach(act => pushActNodes(content, act));
  } else if (mode === 'act') {
    pushActNodes(content, data as ActDto);
  } else if (mode === 'chapter') {
    pushChapterNodes(content, data as ChapterDto);
  } else if (mode === 'scene') {
    pushSceneNodes(content, data as SceneDto);
  }

  ensureNonEmptyDocument(content);

  return { type: 'doc', content };
}

/**
 * Builds the editor document with only the first few scenes fully loaded.
 * The returned skeleton IDs let the store track which scene prose still needs
 * to be fetched and patched into the document.
 */
export function buildEditorContentLazy(
  mode: ManuscriptMode,
  data: ManuscriptDataDto
): { doc: TiptapJsonDoc; skeletonSceneIds: string[] } {
  const content: TiptapNode[] = [];
  const skeletonSceneIds: string[] = [];
  let sceneCount = 0;

  const pushSceneLazy = (scene: SceneDto) => {
    pushSceneSummaryNode(content, scene);

    if (sceneCount < INITIAL_SCENE_COUNT) {
      pushProseContent(content, scene.prose);
    } else {
      content.push({ type: 'sceneSkeleton', attrs: { sceneId: scene.id } });
      skeletonSceneIds.push(scene.id);
    }

    sceneCount++;
  };

  const pushChapterLazy = (chapter: ChapterDto) => {
    pushChapterHeaderNode(content, chapter);
    chapter.scenes?.forEach(scene => pushSceneLazy(scene));
  };

  const pushActLazy = (act: ActDto) => {
    pushActHeaderNode(content, act);
    act.chapters?.forEach(chapter => pushChapterLazy(chapter));
  };

  if (mode === 'book') {
    (data as ActDto[]).forEach(act => pushActLazy(act));
  } else if (mode === 'act') {
    pushActLazy(data as ActDto);
  } else if (mode === 'chapter') {
    pushChapterLazy(data as ChapterDto);
  } else if (mode === 'scene') {
    pushSceneLazy(data as SceneDto);
  }

  ensureNonEmptyDocument(content);

  return { doc: { type: 'doc', content }, skeletonSceneIds };
}

/**
 * Builds replacement nodes for a skeleton scene. Empty scenes still receive a
 * paragraph so the user has a writable place after lazy loading completes.
 */
export function buildScenePatch(prose: TiptapJsonDoc | null): TiptapNode[] {
  if (prose?.content?.length) {
    return prose.content;
  }

  return [{ type: 'paragraph' }];
}


// ---------------------------------------------------------------------------
// Manuscript DTO Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts a manuscript entity as an act-rooted hierarchy. Unrelated sibling
 * entities are omitted, while the ancestors of chapter and scene targets are
 * retained so consumers can preserve manuscript structure.
 *
 * When `beforeAiPromptId` is supplied, `id` must identify a scene. The scene's
 * prose is truncated immediately before that prompt node.
 */
export function extractManuscriptHierarchyById(
  editor: Editor | undefined,
  id: string,
  beforeAiPromptId?: string,
): ActDto[] | null {
  if (!editor || !editor.state?.doc) return null;

  const result: ActDto[] = [];
  let targetKind: 'book' | 'act' | 'chapter' | 'scene' | null = null;
  let currentAct: ActDto | null = null;
  let currentChapter: ChapterDto | null = null;
  let currentScene: SceneDto | null = null;
  let resultAct: ActDto | null = null;
  let resultChapter: ChapterDto | null = null;
  let resultScene: SceneDto | null = null;
  let foundPrompt = beforeAiPromptId === undefined;

  const doc = editor.state.doc;
  for (let index = 0; index < doc.childCount; index++) {
    const node = doc.child(index);

    if (node.type.name === 'actHeader') {
      if (targetKind && targetKind !== 'book') break;

      currentAct = createActFromNode(node);
      currentChapter = null;
      currentScene = null;
      resultChapter = null;
      resultScene = null;

      if (targetKind === 'book') {
        resultAct = currentAct;
        result.push(resultAct);
      } else if (currentAct.bookId === id) {
        if (beforeAiPromptId !== undefined) return null;
        targetKind = 'book';
        resultAct = currentAct;
        result.push(resultAct);
      } else if (currentAct.id === id) {
        if (beforeAiPromptId !== undefined) return null;
        targetKind = 'act';
        resultAct = currentAct;
        result.push(resultAct);
      } else {
        resultAct = null;
      }
      continue;
    }

    if (node.type.name === 'chapterHeader') {
      if (targetKind === 'chapter' || targetKind === 'scene') break;

      currentChapter = createChapterFromNode(node, currentAct?.id || '');
      currentScene = null;
      resultScene = null;

      if (targetKind === 'book' || targetKind === 'act') {
        if (!resultAct) continue;
        resultChapter = currentChapter;
        resultAct.chapters!.push(resultChapter);
      } else if (currentChapter.id === id) {
        if (beforeAiPromptId !== undefined) return null;
        targetKind = 'chapter';
        resultAct = cloneActWithoutChildren(
          currentAct ?? createEmptyAct([], currentChapter.actId),
        );
        resultChapter = currentChapter;
        resultAct.chapters!.push(resultChapter);
        result.push(resultAct);
      } else {
        resultChapter = null;
      }
      continue;
    }

    if (node.type.name === 'sceneSummary') {
      if (targetKind === 'scene') break;

      currentScene = createSceneFromNode(node, currentChapter?.id || '');
      if (targetKind === 'book' || targetKind === 'act' || targetKind === 'chapter') {
        if (!resultChapter) {
          resultChapter = createEmptyChapter(
            currentAct?.id || '',
            [],
            currentScene.chapterId,
          );
          resultAct?.chapters!.push(resultChapter);
        }
        resultScene = currentScene;
        resultChapter.scenes!.push(resultScene);
      } else if (currentScene.id === id) {
        targetKind = 'scene';
        const ancestorChapter = currentChapter
          ?? createEmptyChapter(currentAct?.id || '', [], currentScene.chapterId);
        resultAct = cloneActWithoutChildren(
          currentAct ?? createEmptyAct([], ancestorChapter.actId),
        );
        resultChapter = cloneChapterWithoutScenes(ancestorChapter);
        resultScene = currentScene;
        resultChapter.scenes!.push(resultScene);
        resultAct.chapters!.push(resultChapter);
        result.push(resultAct);
      } else {
        resultScene = null;
      }
      continue;
    }

    if (!resultScene) continue;

    if (node.type.name === 'sceneSkeleton') {
      resultScene.prose = null;
      continue;
    }

    if (targetKind === 'scene' && beforeAiPromptId !== undefined) {
      if (node.type.name === 'aiPrompt' && node.attrs['id'] === beforeAiPromptId) {
        foundPrompt = true;
        continue;
      }
      if (foundPrompt) continue;
    }

    resultScene.prose?.content.push(node.toJSON());
  }

  if (!targetKind) return null;
  if (targetKind === 'scene' && !foundPrompt) return null;
  return result;
}

export function extractTextFromJsonNode(node: any): string {
  if (node['type'] === 'text') return node['text'] || '';
  if (node['content']) return node['content'].map(extractTextFromJsonNode).join('');

  return '';
}

export function extractTextFromManuscriptData(data: ManuscriptDataDto | ActDto[] | null): string {
  if (!data) return '';

  let text = '';

  if (Array.isArray(data)) {
    data.forEach(act => text += extractTextFromManuscriptData(act));
  } else if ('chapters' in data) {
    (data.chapters || []).forEach(chapter => text += extractTextFromManuscriptData(chapter));
  } else if ('scenes' in data) {
    (data.scenes || []).forEach(scene => text += extractTextFromManuscriptData(scene));
  } else if ('prose' in data) {
    const scene = data as SceneDto;

    scene.prose?.content?.forEach(node => {
      const nodeText = extractTextFromJsonNode(node);
      if (nodeText) text += `${nodeText}\n`;
    });
  }

  return text.trim();
}


// ---------------------------------------------------------------------------
// AI Context Builders
// ---------------------------------------------------------------------------

/**
 * Returns manuscript context as simple hierarchical HTML for the AI request.
 */
export function getAiContextById(editor: Editor | undefined, id: string): string {
  const data = extractManuscriptHierarchyById(editor, id);
  if (!data) return '';

  return buildHtmlFromManuscriptData(data);
}

export function buildHtmlFromManuscriptData(data: ManuscriptDataDto | ActDto[] | null): string {
  if (!data) return '';

  let html = '';

  if (Array.isArray(data)) {
    data.forEach(act => html += buildHtmlFromManuscriptData(act));
  } else if ('chapters' in data) {
    const act = data as ActDto;
    const pos = act.position !== undefined ? act.position + 1 : '';
    const title = act.title ? `: ${act.title}` : '';

    html += `<h1>Act ${pos}${title}</h1>\n`;
    (act.chapters || []).forEach(chapter => html += buildHtmlFromManuscriptData(chapter));
  } else if ('scenes' in data) {
    const chapter = data as ChapterDto;
    const pos = chapter.position !== undefined ? chapter.position + 1 : '';
    const title = chapter.title ? `: ${chapter.title}` : '';

    html += `<h2>Chapter ${pos}${title}</h2>\n`;
    (chapter.scenes || []).forEach(scene => html += buildHtmlFromManuscriptData(scene));
  } else if ('prose' in data) {
    html += buildSceneHtml(data as SceneDto);
  }

  return html;
}

/**
 * Counts the total words in a scene by rebuilding that scene from the editor.
 */
export function countWordsInScene(editor: Editor | undefined, sceneId: string): number {
  const hierarchy = extractManuscriptHierarchyById(editor, sceneId);
  const scene = hierarchy?.[0]?.chapters?.[0]?.scenes?.[0];
  if (!scene) return 0;

  const text = extractTextFromManuscriptData(scene);
  return text.trim().split(/\s+/).filter(Boolean).length;
}


// ---------------------------------------------------------------------------
// Private Node Builders
// ---------------------------------------------------------------------------

function pushActNodes(content: TiptapNode[], act: ActDto): void {
  pushActHeaderNode(content, act);
  act.chapters?.forEach(chapter => pushChapterNodes(content, chapter));
}

function pushChapterNodes(content: TiptapNode[], chapter: ChapterDto): void {
  pushChapterHeaderNode(content, chapter);
  chapter.scenes?.forEach(scene => pushSceneNodes(content, scene));
}

function pushSceneNodes(content: TiptapNode[], scene: SceneDto): void {
  pushSceneSummaryNode(content, scene);
  pushProseContent(content, scene.prose);
}

function pushActHeaderNode(content: TiptapNode[], act: ActDto): void {
  content.push({
    type: 'actHeader',
    attrs: { id: act.id, bookId: act.bookId, title: act.title, position: act.position },
  });
}

function pushChapterHeaderNode(content: TiptapNode[], chapter: ChapterDto): void {
  content.push({
    type: 'chapterHeader',
    attrs: { id: chapter.id, actId: chapter.actId, title: chapter.title, position: chapter.position },
  });
}

function pushSceneSummaryNode(content: TiptapNode[], scene: SceneDto): void {
  content.push({
    type: 'sceneSummary',
    attrs: {
      id: scene.id,
      chapterId: scene.chapterId,
      title: scene.title,
      summary: scene.summary,
      position: scene.position,
    },
  });
}

function pushProseContent(content: TiptapNode[], prose: TiptapJsonDoc | null): void {
  if (prose?.content?.length) {
    content.push(...prose.content);
  }
}

function ensureNonEmptyDocument(content: TiptapNode[]): void {
  if (content.length === 0) {
    content.push({ type: 'paragraph' });
  }
}


// ---------------------------------------------------------------------------
// Private DTO Builders
// ---------------------------------------------------------------------------

function createActFromNode(node: any): ActDto {
  return {
    id: node.attrs['id'],
    title: node.attrs['title'] || '',
    position: node.attrs['position'] || 0,
    bookId: node.attrs['bookId'] || '',
    status: 'active',
    summary: null,
    chapters: [],
  };
}

function createChapterFromNode(node: any, actId: string): ChapterDto {
  return {
    id: node.attrs['id'],
    title: node.attrs['title'] || '',
    position: node.attrs['position'] || 0,
    actId: node.attrs['actId'] || actId,
    status: 'active',
    summary: null,
    scenes: [],
  };
}

function createSceneFromNode(node: any, chapterId: string): SceneDto {
  return {
    id: node.attrs['id'],
    title: node.attrs['title'] || '',
    position: node.attrs['position'] || 0,
    chapterId: node.attrs['chapterId'] || chapterId,
    status: 'active',
    summary: node.attrs['summary'] || null,
    prose: { type: 'doc', content: [] },
    wordCount: null,
    pointOfViewOverride: null,
    povCharacterIdOverride: null,
  };
}

function createEmptyAct(chapters: ChapterDto[] = [], id = ''): ActDto {
  return {
    id,
    title: '',
    position: 0,
    bookId: '',
    status: 'active',
    summary: null,
    chapters,
  };
}

function createEmptyChapter(actId: string, scenes: SceneDto[] = [], id = ''): ChapterDto {
  return {
    id,
    title: '',
    position: 0,
    actId,
    status: 'active',
    summary: null,
    scenes,
  };
}

function cloneActWithoutChildren(act: ActDto): ActDto {
  return { ...act, chapters: [] };
}

function cloneChapterWithoutScenes(chapter: ChapterDto): ChapterDto {
  return { ...chapter, scenes: [] };
}

function buildSceneHtml(scene: SceneDto): string {
  const pos = scene.position !== undefined ? scene.position + 1 : '';
  const title = scene.title ? `: ${scene.title}` : '';
  let html = `<h3>Scene ${pos}${title}</h3>\n`;

  scene.prose?.content?.forEach(node => {
    const text = extractTextFromJsonNode(node);
    if (!text) return;

    if (node['type'] === 'heading') {
      const attrs = node['attrs'] as Record<string, any> | undefined;
      const level = attrs?.['level'] || 1;
      html += `<h${level + 3}>${text}</h${level + 3}>\n`;
    } else {
      html += `<p>${text}</p>\n`;
    }
  });

  return html;
}
