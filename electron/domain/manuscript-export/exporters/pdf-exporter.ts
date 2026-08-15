import { BrowserWindow } from 'electron';

import type { TiptapMark, TiptapNode } from '../../../../shared/models/manuscript.model';
import type {
  ManuscriptExportAct,
  ManuscriptExportChapter,
  ManuscriptExportDocument,
  ManuscriptExportNode,
  ManuscriptExportScene,
} from '../models';

const IGNORED_NODE_TYPES = new Set(['aiPrompt', 'aiGeneratedBlock']);
const MAX_HEADING_LEVEL = 6;

interface RenderContext {
  sceneId: string;
}

/** Converts normalized manuscript content into a complete PDF document. */
export async function exportManuscriptToPdf(
  manuscript: ManuscriptExportDocument,
): Promise<Buffer> {
  const html = buildHtmlDocument(manuscript);
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }
}

function buildHtmlDocument(manuscript: ManuscriptExportDocument): string {
  const context: RenderContext = { sceneId: '' };
  const titlePage = manuscript.target.mode === 'book'
    ? renderTitlePage(manuscript.book.title, manuscript.book.author)
    : '';
  const content = manuscript.nodes.map((node) => renderStructureNode(node, context)).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <meta name="author" content="${escapeAttribute(manuscript.book.author)}">
  <title>${escapeHtml(manuscript.book.title)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <main class="export-root">${titlePage}${content}</main>
</body>
</html>`;
}

function renderTitlePage(title: string, author: string): string {
  return `<section class="title-page">
    <h1>${escapeHtml(title)}</h1>
    <p>by ${escapeHtml(author)}</p>
  </section>`;
}

function renderStructureNode(node: ManuscriptExportNode, context: RenderContext): string {
  switch (node.type) {
    case 'act':
      return renderAct(node, context);
    case 'chapter':
      return renderChapter(node, context);
    case 'scene':
      return renderScene(node, context);
  }
}

function renderAct(act: ManuscriptExportAct, context: RenderContext): string {
  const title = act.title ? `<h2 class="act-title">${escapeHtml(act.title)}</h2>` : '';
  const chapters = act.chapters.map((chapter) => renderChapter(chapter, context)).join('');

  return `<section class="act">
    <h1 class="act-number">ACT ${act.number}</h1>
    ${title}
  </section>${chapters}`;
}

function renderChapter(chapter: ManuscriptExportChapter, context: RenderContext): string {
  const scenes = chapter.scenes.map((scene) => renderScene(scene, context)).join('');

  return `<section class="chapter">
    <h1 class="chapter-heading">${structureLabel('Chapter', chapter.number, chapter.title)}</h1>
    ${scenes}
  </section>`;
}

function renderScene(scene: ManuscriptExportScene, context: RenderContext): string {
  context.sceneId = scene.id;
  const prose = scene.prose.content.map((node) => renderBlock(node, context)).join('');

  return `<section class="scene">
    <h2 class="scene-heading">${structureLabel('Scene', scene.number, scene.title)}</h2>
    <div class="scene-prose">${prose}</div>
  </section>`;
}

function structureLabel(kind: string, number: number, title: string | null): string {
  const label = title ? `${kind} ${number} — ${title}` : `${kind} ${number}`;
  return escapeHtml(label);
}

function renderBlock(node: TiptapNode, context: RenderContext): string {
  if (IGNORED_NODE_TYPES.has(node.type)) {
    return '';
  }

  switch (node.type) {
    case 'paragraph':
      return `<p>${renderInlineContent(node.content ?? [], context)}</p>`;
    case 'heading':
      return renderHeading(node, context);
    case 'bulletList':
      return renderList(node, context, 'ul');
    case 'orderedList':
      return renderList(node, context, 'ol');
    case 'blockquote':
      return renderBlockquote(node, context);
    case 'codeBlock':
      return `<pre><code>${renderInlineContent(node.content ?? [], context)}</code></pre>`;
    case 'horizontalRule':
      return '<hr>';
    default:
      throw unsupportedNodeError(node.type, context.sceneId);
  }
}

function renderHeading(node: TiptapNode, context: RenderContext): string {
  const rawLevel = node.attrs?.['level'];
  const level = typeof rawLevel === 'number' ? rawLevel : 1;

  if (!Number.isInteger(level) || level < 1 || level > MAX_HEADING_LEVEL) {
    throw new Error(
      `Unsupported Tiptap heading level "${String(rawLevel)}" in scene "${context.sceneId}".`,
    );
  }

  return `<h${level} class="prose-heading">${renderInlineContent(node.content ?? [], context)}</h${level}>`;
}

function renderBlockquote(node: TiptapNode, context: RenderContext): string {
  const content = (node.content ?? []).map((child) => {
    if (child.type !== 'paragraph' && child.type !== 'heading') {
      throw unsupportedNodeError(child.type, context.sceneId);
    }

    return renderBlock(child, context);
  }).join('');

  return `<blockquote>${content}</blockquote>`;
}

function renderList(node: TiptapNode, context: RenderContext, tag: 'ul' | 'ol'): string {
  const start = tag === 'ol' ? orderedListStart(node) : null;
  const startAttribute = start && start !== 1 ? ` start="${start}"` : '';
  const items = (node.content ?? []).map((listItem) => {
    if (listItem.type !== 'listItem') {
      throw unsupportedNodeError(listItem.type, context.sceneId);
    }

    return `<li>${(listItem.content ?? []).map((child) => renderBlock(child, context)).join('')}</li>`;
  }).join('');

  return `<${tag}${startAttribute}>${items}</${tag}>`;
}

function orderedListStart(node: TiptapNode): number {
  const rawStart = node.attrs?.['start'];
  return typeof rawStart === 'number' && Number.isInteger(rawStart) && rawStart >= 1 ? rawStart : 1;
}

function renderInlineContent(nodes: TiptapNode[], context: RenderContext): string {
  return nodes.map((node) => {
    if (IGNORED_NODE_TYPES.has(node.type)) {
      return '';
    }

    if (node.type === 'hardBreak') {
      return '<br>';
    }

    if (node.type !== 'text') {
      throw unsupportedNodeError(node.type, context.sceneId);
    }

    return renderTextNode(node, context);
  }).join('');
}

function renderTextNode(node: TiptapNode, context: RenderContext): string {
  let content = escapeHtml(node.text ?? '').replace(/\n/g, '<br>');

  (node.marks ?? []).forEach((mark) => {
    content = applyMark(mark, content, context.sceneId);
  });

  return content;
}

function applyMark(mark: TiptapMark, content: string, sceneId: string): string {
  switch (mark.type) {
    case 'bold':
      return `<strong>${content}</strong>`;
    case 'italic':
      return `<em>${content}</em>`;
    case 'strike':
      return `<s>${content}</s>`;
    case 'underline':
      return `<u>${content}</u>`;
    case 'code':
      return `<code>${content}</code>`;
    case 'link': {
      const href = mark.attrs?.['href'];
      if (typeof href !== 'string' || href.length === 0) {
        throw new Error(`Invalid Tiptap link mark in scene "${sceneId}": href is required.`);
      }
      return `<a href="${escapeAttribute(href)}">${content}</a>`;
    }
    default:
      throw new Error(`Unsupported Tiptap mark "${mark.type}" in scene "${sceneId}".`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unsupportedNodeError(nodeType: string, sceneId: string): Error {
  return new Error(`Unsupported Tiptap node "${nodeType}" in scene "${sceneId}".`);
}

const PRINT_STYLES = `
@page {
  size: Letter portrait;
  margin: 1in;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  color: #000;
  font-family: "Times New Roman";
  font-size: 12pt;
}

.title-page {
  break-after: page;
  padding-top: 3in;
  text-align: center;
}

.title-page h1 {
  margin: 0 0 24pt;
  font-size: 16pt;
}

.title-page p {
  margin: 0;
  text-indent: 0;
}

.act,
.chapter {
  break-before: page;
}

.act {
  padding-top: 3in;
  text-align: center;
}

.act-number,
.act-title,
.chapter-heading,
.scene-heading {
  break-after: avoid;
  text-align: center;
  text-indent: 0;
}

.act-number,
.act-title {
  margin: 0;
  font-size: 14pt;
}

.act-title {
  margin-top: 12pt;
}

.chapter {
  padding-top: 0.5in;
}

.chapter-heading {
  margin: 0;
  font-size: 14pt;
}

.scene-heading {
  margin: 24pt 0 12pt;
  font-size: 12pt;
}

.export-root > .scene:first-child > .scene-heading {
  margin-top: 0;
}

.scene-prose p {
  margin: 0;
  line-height: 2;
  text-indent: 0.5in;
}

.prose-heading {
  break-after: avoid;
  margin: 12pt 0 6pt;
  line-height: 1;
  text-indent: 0;
}

h1.prose-heading { font-size: 16pt; }
h2.prose-heading { font-size: 15pt; }
h3.prose-heading { font-size: 14pt; }
h4.prose-heading { font-size: 13pt; }
h5.prose-heading,
h6.prose-heading { font-size: 12pt; }

ul,
ol {
  margin: 0;
  padding-left: 0.5in;
}

li > p {
  text-indent: 0;
}

blockquote {
  margin: 0 0.5in;
  font-style: italic;
}

blockquote p,
blockquote .prose-heading {
  text-indent: 0;
}

pre {
  margin: 6pt 0.25in;
  padding: 6pt;
  background: #f2f2f2;
  font-family: "Courier New";
  font-size: 10pt;
  line-height: 1;
  white-space: pre-wrap;
}

code {
  background: #f2f2f2;
  font-family: "Courier New";
}

hr {
  margin: 12pt 0;
  border: 0;
  border-top: 1px solid #000;
}
`;
