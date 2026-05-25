import { ManuscriptMode, ActDto, ChapterDto, SceneDto } from '../../../../../shared/models/manuscript.model';

export function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildEditorContent(mode: ManuscriptMode, data: any): string {
  let content = '';

  if (mode === 'book') {
    const acts = data as ActDto[];
    acts.forEach(act => {
      content += `<act-header data-id="${act.id}" data-title="${escapeHtml(act.title)}" data-position="${act.position}"></act-header>`;
      if (act.prose) content += act.prose;
      act.chapters?.forEach(chapter => {
        content += `<chapter-header data-id="${chapter.id}" data-title="${escapeHtml(chapter.title)}" data-position="${chapter.position}"></chapter-header>`;
        if (chapter.prose) content += chapter.prose;
        chapter.scenes?.forEach(scene => {
          content += `<scene-summary data-id="${scene.id}" data-title="${escapeHtml(scene.title)}" data-summary="${escapeHtml(scene.summary)}" data-position="${scene.position}"></scene-summary>`;
          if (scene.prose) content += scene.prose;
        });
      });
    });
  } else if (mode === 'act') {
    const act = data as ActDto;
    content += `<act-header data-id="${act.id}" data-title="${escapeHtml(act.title)}" data-position="${act.position}"></act-header>`;
    if (act.prose) content += act.prose;
    act.chapters?.forEach(chapter => {
      content += `<chapter-header data-id="${chapter.id}" data-title="${escapeHtml(chapter.title)}" data-position="${chapter.position}"></chapter-header>`;
      if (chapter.prose) content += chapter.prose;
      chapter.scenes?.forEach(scene => {
        content += `<scene-summary data-id="${scene.id}" data-title="${escapeHtml(scene.title)}" data-summary="${escapeHtml(scene.summary)}" data-position="${scene.position}"></scene-summary>`;
        if (scene.prose) content += scene.prose;
      });
    });
  } else if (mode === 'chapter') {
    const chapter = data as ChapterDto;
    content += `<chapter-header data-id="${chapter.id}" data-title="${escapeHtml(chapter.title)}" data-position="${chapter.position}"></chapter-header>`;
    if (chapter.prose) content += chapter.prose;
    chapter.scenes?.forEach(scene => {
      content += `<scene-summary data-id="${scene.id}" data-title="${escapeHtml(scene.title)}" data-summary="${escapeHtml(scene.summary)}" data-position="${scene.position}"></scene-summary>`;
      if (scene.prose) content += scene.prose;
    });
  } else if (mode === 'scene') {
    const scene = data as SceneDto;
    content += `<scene-summary data-id="${scene.id}" data-title="${escapeHtml(scene.title)}" data-summary="${escapeHtml(scene.summary)}" data-position="${scene.position}"></scene-summary>`;
    if (scene.prose) content += scene.prose;
  }

  return content || '<p></p>';
}
