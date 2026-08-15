import { ManuscriptMode, ActDto, ChapterDto, SceneDto, TiptapJsonDoc } from '../../../../../shared/models/manuscript.model';

/**
 * Builds a Tiptap-compatible JSON document from manuscript DTOs.
 * Each structural element (act, chapter, scene) becomes a header node,
 * followed by the paragraph/text nodes from its stored `prose` JSON.
 */
export function buildEditorContent(mode: ManuscriptMode, data: any): TiptapJsonDoc {
  const content: Record<string, any>[] = [];

  if (mode === 'book') {
    const acts = data as ActDto[];
    acts.forEach(act => {
      pushActNodes(content, act);
    });
  } else if (mode === 'act') {
    const act = data as ActDto;
    pushActNodes(content, act);
  } else if (mode === 'chapter') {
    const chapter = data as ChapterDto;
    pushChapterNodes(content, chapter);
  } else if (mode === 'scene') {
    const scene = data as SceneDto;
    pushSceneNodes(content, scene);
  }

  // Ensure the document always has at least one node (empty paragraph)
  if (content.length === 0) {
    content.push({ type: 'paragraph' });
  }

  return { type: 'doc', content };
}

// ---------------------------------------------------------------------------
// Private helpers — push nodes into the content array
// ---------------------------------------------------------------------------

function pushActNodes(content: Record<string, any>[], act: ActDto): void {
  content.push({
    type: 'actHeader',
    attrs: { id: act.id, title: act.title, position: act.position }
  });

  act.chapters?.forEach(chapter => {
    pushChapterNodes(content, chapter);
  });
}

function pushChapterNodes(content: Record<string, any>[], chapter: ChapterDto): void {
  content.push({
    type: 'chapterHeader',
    attrs: { id: chapter.id, title: chapter.title, position: chapter.position }
  });

  chapter.scenes?.forEach(scene => {
    pushSceneNodes(content, scene);
  });
}

function pushSceneNodes(content: Record<string, any>[], scene: SceneDto): void {
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
function pushProseContent(content: Record<string, any>[], prose: TiptapJsonDoc | null): void {
  if (prose?.content?.length) {
    content.push(...prose.content);
  }
}
