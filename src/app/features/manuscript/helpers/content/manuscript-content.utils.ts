import { ManuscriptMode, ActDto, ChapterDto, SceneDto, TiptapJsonDoc, TiptapNode, ManuscriptDataDto } from '../../../../../../shared/models/manuscript.model';
import { Editor } from '@tiptap/core';

/**
 * Number of scenes whose prose is included immediately on load.
 * All subsequent scenes are represented by `sceneSkeleton` placeholder nodes
 * and their prose is fetched lazily when they scroll into view.
 */
export const INITIAL_SCENE_COUNT = 3; // ← set back to 3 after testing

/**
 * Builds a Tiptap-compatible JSON document from manuscript DTOs.
 * Each structural element (act, chapter, scene) becomes a header node,
 * followed by the paragraph/text nodes from its stored `prose` JSON.
 */
export function buildEditorContent(mode: ManuscriptMode, data: ManuscriptDataDto): TiptapJsonDoc {
  const content: TiptapNode[] = [];

  if (mode === 'book') {
    (data as ActDto[]).forEach(act => {
      pushActNodes(content, act);
    });
  } else if (mode === 'act') {
    pushActNodes(content, data as ActDto);
  } else if (mode === 'chapter') {
    pushChapterNodes(content, data as ChapterDto);
  } else if (mode === 'scene') {
    pushSceneNodes(content, data as SceneDto);
  }

  // Ensure the document always has at least one node (empty paragraph)
  if (content.length === 0) {
    content.push({ type: 'paragraph' });
  }

  return { type: 'doc', content };
}

/**
 * Lazy variant of buildEditorContent.
 * The first `INITIAL_SCENE_COUNT` scenes get their real prose nodes.
 * All remaining scenes get a `sceneSkeleton` placeholder node instead.
 *
 * Returns both the Tiptap document and the list of scene IDs that were
 * deferred as skeletons so the store can track which ones still need loading.
 */
export function buildEditorContentLazy(
  mode: ManuscriptMode,
  data: ManuscriptDataDto
): { doc: TiptapJsonDoc; skeletonSceneIds: string[] } {
  const content: TiptapNode[] = [];
  const skeletonSceneIds: string[] = [];
  let sceneCount = 0;

  const pushSceneLazy = (scene: SceneDto) => {
    content.push({
      type: 'sceneSummary',
      attrs: { id: scene.id, title: scene.title, summary: scene.summary, position: scene.position }
    });

    if (sceneCount < INITIAL_SCENE_COUNT) {
      // Load prose immediately for the first N scenes
      pushProseContent(content, scene.prose);
    } else {
      // Defer: insert a skeleton placeholder
      content.push({ type: 'sceneSkeleton', attrs: { sceneId: scene.id } });
      skeletonSceneIds.push(scene.id);
    }
    sceneCount++;
  };

  const pushChapterLazy = (chapter: ChapterDto) => {
    content.push({
      type: 'chapterHeader',
      attrs: { id: chapter.id, title: chapter.title, position: chapter.position }
    });
    chapter.scenes?.forEach(scene => pushSceneLazy(scene));
  };

  const pushActLazy = (actDto: ActDto) => {
    content.push({
      type: 'actHeader',
      attrs: { id: actDto.id, title: actDto.title, position: actDto.position }
    });
    actDto.chapters?.forEach(chapter => pushChapterLazy(chapter));
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

  if (content.length === 0) {
    content.push({ type: 'paragraph' });
  }

  return { doc: { type: 'doc', content }, skeletonSceneIds };
}

/**
 * Builds the replacement nodes for a skeleton scene patch.
 * Returns the prose paragraph nodes for the given TiptapJsonDoc (or an empty
 * paragraph if the scene has no prose), ready to be spliced into the document
 * in place of the `sceneSkeleton` node.
 */
export function buildScenePatch(prose: TiptapJsonDoc | null): TiptapNode[] {
  if (prose?.content?.length) {
    return prose.content;
  }
  return [{ type: 'paragraph' }];
}


// ---------------------------------------------------------------------------
// Private helpers — push nodes into the content array
// ---------------------------------------------------------------------------

function pushActNodes(content: TiptapNode[], act: ActDto): void {
  content.push({
    type: 'actHeader',
    attrs: { id: act.id, title: act.title, position: act.position }
  });

  act.chapters?.forEach(chapter => {
    pushChapterNodes(content, chapter);
  });
}

function pushChapterNodes(content: TiptapNode[], chapter: ChapterDto): void {
  content.push({
    type: 'chapterHeader',
    attrs: { id: chapter.id, title: chapter.title, position: chapter.position }
  });

  chapter.scenes?.forEach(scene => {
    pushSceneNodes(content, scene);
  });
}

function pushSceneNodes(content: TiptapNode[], scene: SceneDto): void {
  content.push({
    type: 'sceneSummary',
    attrs: { id: scene.id, title: scene.title, summary: scene.summary, position: scene.position }
  });
  pushProseContent(content, scene.prose);
}

/**
 * Spreads the paragraph/text nodes from a stored prose JSON document
 * into the target content array. If prose is null or has no content,
 * nothing is pushed (the header node alone is sufficient).
 */
function pushProseContent(content: TiptapNode[], prose: TiptapJsonDoc | null): void {
  if (prose?.content?.length) {
    content.push(...prose.content);
  }
}

/**
 * Retrieves the structural Manuscript Data (DTO) associated with a given node ID.
 * It builds a hierarchical DTO tree (Act -> Chapter -> Scene) from the editor nodes.
 * If no ID is provided, it returns the entire document as an array of Acts.
 */
export function getProseTextById(editor: Editor | undefined, id?: string): ManuscriptDataDto | ActDto[] | null {
  if (!editor || !editor.state?.doc) return null;

  const acts: ActDto[] = [];
  let currentAct: ActDto | null = null;
  let currentChapter: ChapterDto | null = null;
  let currentScene: SceneDto | null = null;

  editor.state.doc.forEach(n => {
    if (n.type.name === 'actHeader') {
      currentAct = {
        id: n.attrs['id'],
        title: n.attrs['title'] || '',
        position: n.attrs['position'] || 0,
        bookId: '',
        summary: null,
        chapters: []
      };
      acts.push(currentAct);
      currentChapter = null;
      currentScene = null;
    } else if (n.type.name === 'chapterHeader') {
      currentChapter = {
        id: n.attrs['id'],
        title: n.attrs['title'] || '',
        position: n.attrs['position'] || 0,
        actId: currentAct?.id || '',
        summary: null,
        scenes: []
      };
      if (currentAct) {
        currentAct.chapters!.push(currentChapter);
      } else {
        currentAct = { id: '', title: '', position: 0, bookId: '', summary: null, chapters: [currentChapter] };
        acts.push(currentAct);
      }
      currentScene = null;
    } else if (n.type.name === 'sceneSummary') {
      currentScene = {
        id: n.attrs['id'],
        title: n.attrs['title'] || '',
        position: n.attrs['position'] || 0,
        chapterId: currentChapter?.id || '',
        summary: n.attrs['summary'] || null,
        prose: { type: 'doc', content: [] },
        wordCount: null,
        pointOfViewOverride: null,
        povCharacterIdOverride: null
      };
      if (currentChapter) {
        currentChapter.scenes!.push(currentScene);
      } else {
        currentChapter = { id: '', title: '', position: 0, actId: currentAct?.id || '', summary: null, scenes: [currentScene] };
        if (currentAct) {
          currentAct.chapters!.push(currentChapter);
        } else {
          currentAct = { id: '', title: '', position: 0, bookId: '', summary: null, chapters: [currentChapter] };
          acts.push(currentAct);
        }
      }
    } else if (currentScene) {
      currentScene.prose!.content.push(n.toJSON());
    }
  });

  if (!id) return acts;

  for (const act of acts) {
    if (act.id === id) return act;
    for (const chapter of act.chapters || []) {
      if (chapter.id === id) return chapter;
      for (const scene of chapter.scenes || []) {
        if (scene.id === id) return scene;
      }
    }
  }

  return null;
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
  } else if ('chapters' in data) { // ActDto
    (data.chapters || []).forEach(c => text += extractTextFromManuscriptData(c));
  } else if ('scenes' in data) { // ChapterDto
    (data.scenes || []).forEach(s => text += extractTextFromManuscriptData(s));
  } else if ('prose' in data) { // SceneDto
    const scene = data as SceneDto;
    if (scene.prose && scene.prose.content) {
      scene.prose.content.forEach(node => {
        const nodeText = extractTextFromJsonNode(node);
        if (nodeText) text += nodeText + '\n';
      });
    }
  }
  return text.trim();
}

/**
 * Retrieves prose context specifically formatted as well-structured HTML for the AI.
 * It iterates over the generated DTO object to inject hierarchical HTML headers 
 * (<h1>, <h2>, <h3>) so the AI knows exactly what structure and section the text belongs to.
 */
export function getAiContextById(editor: Editor | undefined, id?: string): string {
  const data = getProseTextById(editor, id);
  if (!data) return '';
  return buildHtmlFromManuscriptData(data);
}

export function buildHtmlFromManuscriptData(data: ManuscriptDataDto | ActDto[] | null): string {
  if (!data) return '';
  let html = '';

  if (Array.isArray(data)) {
    data.forEach(act => html += buildHtmlFromManuscriptData(act));
  } else if ('chapters' in data) { // ActDto
    const act = data as ActDto;
    const pos = (act.position !== undefined ? act.position + 1 : '');
    const title = act.title ? `: ${act.title}` : '';
    html += `<h1>Act ${pos}${title}</h1>\n`;
    (act.chapters || []).forEach(c => html += buildHtmlFromManuscriptData(c));
  } else if ('scenes' in data) { // ChapterDto
    const chapter = data as ChapterDto;
    const pos = (chapter.position !== undefined ? chapter.position + 1 : '');
    const title = chapter.title ? `: ${chapter.title}` : '';
    html += `<h2>Chapter ${pos}${title}</h2>\n`;
    (chapter.scenes || []).forEach(s => html += buildHtmlFromManuscriptData(s));
  } else if ('prose' in data) { // SceneDto
    const scene = data as SceneDto;
    const pos = (scene.position !== undefined ? scene.position + 1 : '');
    const title = scene.title ? `: ${scene.title}` : '';
    html += `<h3>Scene ${pos}${title}</h3>\n`;

    if (scene.prose && scene.prose.content) {
      scene.prose.content.forEach(node => {
        if (node['type'] === 'paragraph') {
          const text = extractTextFromJsonNode(node);
          if (text) html += `<p>${text}</p>\n`;
        } else if (node['type'] === 'heading') {
          const attrs = node['attrs'] as Record<string, any> | undefined;
          const level = attrs?.['level'] || 1;
          const text = extractTextFromJsonNode(node);
          if (text) html += `<h${level + 3}>${text}</h${level + 3}>\n`;
        } else {
          const text = extractTextFromJsonNode(node);
          if (text) html += `<p>${text}</p>\n`;
        }
      });
    }
  }

  return html;
}

/**
 * Counts the total words used in a scene, given its ID and the Editor instance.
 * Returns 0 if the scene is not found or has no content.
 */
export function countWordsInScene(editor: Editor | undefined, sceneId: string): number {
  const scene = getProseTextById(editor, sceneId) as SceneDto | null;
  if (!scene || !('prose' in scene)) return 0;

  const text = extractTextFromManuscriptData(scene);
  return text.trim().split(/\s+/).filter(Boolean).length;
}

