import { BrowserWindow } from 'electron';

import type {
  ManuscriptPngExportOptions,
  ManuscriptPngExportTheme,
} from '../../../../shared/models/manuscript-export.model';
import type { TiptapMark, TiptapNode } from '../../../../shared/models/manuscript.model';
import type {
  ManuscriptExportAct,
  ManuscriptExportChapter,
  ManuscriptExportDocument,
  ManuscriptExportNode,
  ManuscriptExportScene,
} from '../models';

const INITIAL_CAPTURE_HEIGHT = 800;
const MAX_CAPTURE_HEIGHT = 32767;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 24;
const MIN_CAPTURE_WIDTH = 320;
const MAX_CAPTURE_WIDTH = 4096;
const IGNORED_NODE_TYPES = new Set(['aiPrompt', 'aiGeneratedBlock']);
const MAX_HEADING_LEVEL = 6;

const DEFAULT_PNG_OPTIONS: ResolvedPngExportOptions = {
  fontSize: 16,
  theme: 'dark',
  width: 700,
};

const THEME_COLORS: Record<ManuscriptPngExportTheme, PngThemeColors> = {
  light: {
    background: '#fafafa',
    text: '#171717',
    surface: '#ffffff',
    secondaryText: '#737373',
    border: 'rgba(0, 0, 0, 0.08)',
  },
  dark: {
    background: '#121212',
    text: '#fdf8f5',
    surface: '#202020',
    secondaryText: '#bbaaaa',
    border: 'rgba(255, 255, 255, 0.08)',
  },
};

interface RenderContext {
  sceneId: string;
}

interface CaptureDimensions {
  width: number;
  height: number;
}

interface ExportManuscriptToPngInput {
  manuscript: ManuscriptExportDocument;
  options?: ManuscriptPngExportOptions;
}

interface ResolvedPngExportOptions {
  fontSize: number;
  theme: ManuscriptPngExportTheme;
  width: number;
}

interface PngThemeColors {
  background: string;
  text: string;
  surface: string;
  secondaryText: string;
  border: string;
}

/** Converts normalized manuscript content into one full-height PNG image. */
export async function exportManuscriptToPng(
  { manuscript, options }: ExportManuscriptToPngInput,
): Promise<Buffer> {
  const resolvedOptions = resolvePngOptions(options);
  const colors = THEME_COLORS[resolvedOptions.theme];
  const html = buildHtmlDocument(manuscript, resolvedOptions, colors);
  const window = new BrowserWindow({
    show: false,
    width: resolvedOptions.width,
    height: INITIAL_CAPTURE_HEIGHT,
    useContentSize: true,
    backgroundColor: colors.background,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const dimensions = await measureCaptureDimensions(window, resolvedOptions.width);
    window.setContentSize(dimensions.width, dimensions.height);

    const [actualWidth, actualHeight] = window.getContentSize();
    if (actualWidth !== dimensions.width || actualHeight !== dimensions.height) {
      throw new Error(
        `PNG export could not create the required ${dimensions.width}x${dimensions.height} capture surface.`,
      );
    }

    const image = await window.webContents.capturePage({
      x: 0,
      y: 0,
      width: dimensions.width,
      height: dimensions.height,
    });
    if (image.isEmpty()) {
      throw new Error('PNG export produced an empty image.');
    }

    return image.toPNG();
  } finally {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }
}

function resolvePngOptions(
  options: ManuscriptPngExportOptions | undefined,
): ResolvedPngExportOptions {
  if (options === undefined) {
    return DEFAULT_PNG_OPTIONS;
  }

  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new Error('PNG export options must be an object.');
  }

  const fontSize = resolveIntegerOption({
    value: options.fontSize,
    defaultValue: DEFAULT_PNG_OPTIONS.fontSize,
    minimum: MIN_FONT_SIZE,
    maximum: MAX_FONT_SIZE,
    errorMessage: `PNG export font size must be an integer between ${MIN_FONT_SIZE} and ${MAX_FONT_SIZE} pixels.`,
  });
  const width = resolveIntegerOption({
    value: options.width,
    defaultValue: DEFAULT_PNG_OPTIONS.width,
    minimum: MIN_CAPTURE_WIDTH,
    maximum: MAX_CAPTURE_WIDTH,
    errorMessage: `PNG export width must be an integer between ${MIN_CAPTURE_WIDTH} and ${MAX_CAPTURE_WIDTH} pixels.`,
  });
  const theme = options.theme ?? DEFAULT_PNG_OPTIONS.theme;

  if (theme !== 'light' && theme !== 'dark') {
    throw new Error('PNG export theme must be either "light" or "dark".');
  }

  return { fontSize, theme, width };
}

interface ResolveIntegerOptionInput {
  value: number | undefined;
  defaultValue: number;
  minimum: number;
  maximum: number;
  errorMessage: string;
}

function resolveIntegerOption({
  value,
  defaultValue,
  minimum,
  maximum,
  errorMessage,
}: ResolveIntegerOptionInput): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(errorMessage);
  }

  return value;
}

async function measureCaptureDimensions(
  window: BrowserWindow,
  width: number,
): Promise<CaptureDimensions> {
  const measuredHeight: unknown = await window.webContents.executeJavaScript(`
    Math.ceil(Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.documentElement.offsetHeight,
      document.body.offsetHeight
    ))
  `);

  if (!Number.isInteger(measuredHeight) || (measuredHeight as number) < 1) {
    throw new Error('PNG export could not determine a valid manuscript height.');
  }

  if ((measuredHeight as number) > MAX_CAPTURE_HEIGHT) {
    throw new Error(
      `PNG export height ${(measuredHeight as number)}px exceeds the single-image limit of ${MAX_CAPTURE_HEIGHT}px.`,
    );
  }

  return { width, height: measuredHeight as number };
}

function buildHtmlDocument(
  manuscript: ManuscriptExportDocument,
  options: ResolvedPngExportOptions,
  colors: PngThemeColors,
): string {
  const context: RenderContext = { sceneId: '' };
  const title = manuscript.target.mode === 'book'
    ? renderBookTitle(manuscript.book.title, manuscript.book.author)
    : '';
  const content = manuscript.nodes.map((node) => renderStructureNode(node, context)).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <meta name="author" content="${escapeAttribute(manuscript.book.author)}">
  <title>${escapeHtml(manuscript.book.title)}</title>
  <style>${captureStyles(options, colors)}</style>
</head>
<body>
  <main class="export-root">${title}${content}</main>
</body>
</html>`;
}

function renderBookTitle(title: string, author: string): string {
  return `<header class="book-title">
    <h1>${escapeHtml(title)}</h1>
    <p>by ${escapeHtml(author)}</p>
  </header>`;
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

function captureStyles(
  options: ResolvedPngExportOptions,
  colors: PngThemeColors,
): string {
  return `
* {
  box-sizing: border-box;
}

html,
body {
  width: ${options.width}px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: ${colors.background};
}

body {
  color: ${colors.text};
  font-family: "Times New Roman", serif;
  font-size: ${options.fontSize}px;
  line-height: 2;
}

a {
  color: ${colors.text};
}

.export-root {
  width: 68%;
  min-height: 1px;
  margin: 0 auto;
  padding: 96px 0;
}

.book-title {
  padding: 160px 0 224px;
  text-align: center;
}

.book-title h1 {
  margin: 0 0 24px;
  font-size: 2em;
  line-height: 1.2;
}

.book-title p {
  margin: 0;
  color: ${colors.secondaryText};
  text-indent: 0;
}

.act {
  padding: 96px 0 64px;
  text-align: center;
}

.act-number,
.act-title,
.chapter-heading,
.scene-heading {
  text-align: center;
  text-indent: 0;
}

.act-number,
.act-title {
  margin: 0;
  font-size: 1.5556em;
  line-height: 1.3;
}

.act-title {
  margin-top: 12px;
  color: ${colors.secondaryText};
}

.chapter {
  padding-top: 72px;
}

.chapter-heading {
  margin: 0 0 48px;
  font-size: 1.4444em;
  line-height: 1.3;
}

.scene-heading {
  margin: 48px 0 24px;
  color: ${colors.secondaryText};
  font-size: 1.1111em;
  line-height: 1.4;
}

.export-root > .scene:first-child > .scene-heading {
  margin-top: 0;
}

.scene-prose p {
  min-height: 1em;
  margin: 0;
  text-indent: 48px;
}

.prose-heading {
  margin: 32px 0 12px;
  line-height: 1.3;
  text-indent: 0;
}

h1.prose-heading { font-size: 1.6667em; }
h2.prose-heading { font-size: 1.5556em; }
h3.prose-heading { font-size: 1.4444em; }
h4.prose-heading { font-size: 1.3333em; }
h5.prose-heading { font-size: 1.2222em; }
h6.prose-heading { font-size: 1.1111em; }

ul,
ol {
  margin: 12px 0;
  padding-left: 48px;
}

li > p {
  text-indent: 0;
}

blockquote {
  margin: 24px 48px;
  color: ${colors.secondaryText};
  font-style: italic;
}

blockquote p,
blockquote .prose-heading {
  text-indent: 0;
}

pre {
  margin: 24px;
  padding: 20px;
  border-radius: 8px;
  background: ${colors.surface};
  font-family: "Courier New", monospace;
  font-size: 0.8333em;
  line-height: 1.5;
  white-space: pre-wrap;
}

code {
  padding: 2px 4px;
  border-radius: 4px;
  background: ${colors.surface};
  font-family: "Courier New", monospace;
}

pre code {
  padding: 0;
}

hr {
  margin: 36px 0;
  border: 0;
  border-top: 1px solid ${colors.border};
}
`;
}
