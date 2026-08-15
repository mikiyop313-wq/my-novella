import JSZip from 'jszip';

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
const EPUB_MIME_TYPE = 'application/epub+zip';

const LANGUAGE_TAGS: Readonly<Record<string, string>> = {
  afrikaans: 'af',
  albanian: 'sq',
  amharic: 'am',
  arabic: 'ar',
  armenian: 'hy',
  azerbaijani: 'az',
  basque: 'eu',
  belarusian: 'be',
  bengali: 'bn',
  bosnian: 'bs',
  bulgarian: 'bg',
  burmese: 'my',
  catalan: 'ca',
  cebuano: 'ceb',
  'chinese (simplified)': 'zh-Hans',
  'chinese (traditional)': 'zh-Hant',
  corsican: 'co',
  croatian: 'hr',
  czech: 'cs',
  danish: 'da',
  dutch: 'nl',
  english: 'en',
  esperanto: 'eo',
  estonian: 'et',
  'filipino (tagalog)': 'tl',
  finnish: 'fi',
  french: 'fr',
  frisian: 'fy',
  galician: 'gl',
  georgian: 'ka',
  german: 'de',
  greek: 'el',
  gujarati: 'gu',
  'haitian creole': 'ht',
  hausa: 'ha',
  hawaiian: 'haw',
  hebrew: 'he',
  hindi: 'hi',
  hmong: 'hmn',
  hungarian: 'hu',
  icelandic: 'is',
  igbo: 'ig',
  indonesian: 'id',
  irish: 'ga',
  italian: 'it',
  japanese: 'ja',
  javanese: 'jv',
  kannada: 'kn',
  kazakh: 'kk',
  khmer: 'km',
  kinyarwanda: 'rw',
  korean: 'ko',
  'kurdish (kurmanji)': 'ku',
  kyrgyz: 'ky',
  lao: 'lo',
  latin: 'la',
  latvian: 'lv',
  lithuanian: 'lt',
  luxembourgish: 'lb',
  macedonian: 'mk',
  malagasy: 'mg',
  malay: 'ms',
  malayalam: 'ml',
  maltese: 'mt',
  maori: 'mi',
  marathi: 'mr',
  mongolian: 'mn',
  nepali: 'ne',
  'norwegian (bokmål)': 'nb',
  'norwegian (nynorsk)': 'nn',
  'odia (oriya)': 'or',
  pashto: 'ps',
  'persian (farsi)': 'fa',
  polish: 'pl',
  'portuguese (brazil)': 'pt-BR',
  'portuguese (portugal)': 'pt-PT',
  punjabi: 'pa',
  romanian: 'ro',
  russian: 'ru',
  samoan: 'sm',
  'scottish gaelic': 'gd',
  serbian: 'sr',
  sesotho: 'st',
  shona: 'sn',
  sindhi: 'sd',
  sinhala: 'si',
  slovak: 'sk',
  slovenian: 'sl',
  somali: 'so',
  spanish: 'es',
  sundanese: 'su',
  swahili: 'sw',
  swedish: 'sv',
  tajik: 'tg',
  tamil: 'ta',
  tatar: 'tt',
  telugu: 'te',
  thai: 'th',
  turkish: 'tr',
  turkmen: 'tk',
  ukrainian: 'uk',
  urdu: 'ur',
  uyghur: 'ug',
  uzbek: 'uz',
  vietnamese: 'vi',
  welsh: 'cy',
  xhosa: 'xh',
  yiddish: 'yi',
  yoruba: 'yo',
  zulu: 'zu',
};

interface EpubContentDocument {
  id: string;
  fileName: string;
  title: string;
  body: string;
}

interface EpubNavigationEntry {
  label: string;
  href: string;
  children: EpubNavigationEntry[];
}

interface RenderContext {
  sceneId: string;
  nextAct: number;
  nextChapter: number;
  nextScene: number;
}

interface EpubPublication {
  documents: EpubContentDocument[];
  navigation: EpubNavigationEntry[];
}

/** Converts normalized manuscript content into a complete EPUB 3 archive. */
export async function exportManuscriptToEpub(
  manuscript: ManuscriptExportDocument,
): Promise<Buffer> {
  const languageTag = resolveLanguageTag(manuscript.book.language);
  const publication = buildPublication(manuscript);
  const archive = new JSZip();

  archive.file('mimetype', EPUB_MIME_TYPE, { compression: 'STORE' });
  archive.file('META-INF/container.xml', CONTAINER_XML);
  archive.file('EPUB/styles.css', EPUB_STYLES);
  archive.file('EPUB/nav.xhtml', buildNavigationDocument({
    title: manuscript.book.title,
    languageTag,
    entries: publication.navigation,
  }));
  archive.file('EPUB/package.opf', buildPackageDocument({
    manuscript,
    languageTag,
    documents: publication.documents,
  }));

  publication.documents.forEach((document) => {
    archive.file(`EPUB/${document.fileName}`, buildContentDocument(document, languageTag));
  });

  return archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX',
  });
}

function buildPublication(manuscript: ManuscriptExportDocument): EpubPublication {
  const publication: EpubPublication = { documents: [], navigation: [] };
  const context: RenderContext = {
    sceneId: '',
    nextAct: 1,
    nextChapter: 1,
    nextScene: 1,
  };

  if (manuscript.target.mode === 'book') {
    publication.documents.push({
      id: 'title-page',
      fileName: 'text/title.xhtml',
      title: manuscript.book.title,
      body: `<section class="title-page" epub:type="titlepage"><h1>${escapeXml(manuscript.book.title)}</h1><p>by ${escapeXml(manuscript.book.author)}</p></section>`,
    });
    publication.navigation.push({
      label: manuscript.book.title,
      href: 'text/title.xhtml',
      children: [],
    });
  }

  manuscript.nodes.forEach((node) => appendStructureNode(publication, node, context));
  return publication;
}

function appendStructureNode(
  publication: EpubPublication,
  node: ManuscriptExportNode,
  context: RenderContext,
): void {
  switch (node.type) {
    case 'act':
      appendAct(publication, node, context);
      return;
    case 'chapter':
      publication.navigation.push(appendChapter(publication, node, context));
      return;
    case 'scene':
      publication.navigation.push(appendSceneDocument(publication, node, context));
      return;
  }
}

function appendAct(
  publication: EpubPublication,
  act: ManuscriptExportAct,
  context: RenderContext,
): void {
  const sequence = context.nextAct++;
  const id = `act-${sequence}`;
  const fileName = `text/${id}.xhtml`;
  const label = structureLabel('Act', act.number, act.title);
  const title = act.title ? `<h2>${escapeXml(act.title)}</h2>` : '';

  publication.documents.push({
    id,
    fileName,
    title: label,
    body: `<section class="act" epub:type="part"><h1>ACT ${act.number}</h1>${title}</section>`,
  });

  const entry: EpubNavigationEntry = { label, href: fileName, children: [] };
  act.chapters.forEach((chapter) => {
    entry.children.push(appendChapter(publication, chapter, context));
  });
  publication.navigation.push(entry);
}

function appendChapter(
  publication: EpubPublication,
  chapter: ManuscriptExportChapter,
  context: RenderContext,
): EpubNavigationEntry {
  const sequence = context.nextChapter++;
  const id = `chapter-${sequence}`;
  const fileName = `text/${id}.xhtml`;
  const label = structureLabel('Chapter', chapter.number, chapter.title);
  const children: EpubNavigationEntry[] = [];
  const scenes = chapter.scenes.map((scene) => {
    const rendered = renderScene(scene, context);
    children.push({
      label: structureLabel('Scene', scene.number, scene.title),
      href: `${fileName}#${rendered.anchor}`,
      children: [],
    });
    return rendered.html;
  }).join('');

  publication.documents.push({
    id,
    fileName,
    title: label,
    body: `<section class="chapter" epub:type="chapter"><h1>${escapeXml(label)}</h1>${scenes}</section>`,
  });

  return { label, href: fileName, children };
}

function appendSceneDocument(
  publication: EpubPublication,
  scene: ManuscriptExportScene,
  context: RenderContext,
): EpubNavigationEntry {
  const rendered = renderScene(scene, context);
  const id = 'scene-document';
  const fileName = 'text/scene.xhtml';
  const label = structureLabel('Scene', scene.number, scene.title);

  publication.documents.push({ id, fileName, title: label, body: rendered.html });
  return { label, href: `${fileName}#${rendered.anchor}`, children: [] };
}

function renderScene(
  scene: ManuscriptExportScene,
  context: RenderContext,
): { anchor: string; html: string } {
  context.sceneId = scene.id;
  const anchor = `scene-${context.nextScene++}`;
  const label = structureLabel('Scene', scene.number, scene.title);
  const prose = scene.prose.content.map((node) => renderBlock(node, context)).join('');

  return {
    anchor,
    html: `<section id="${anchor}" class="scene"><h2>${escapeXml(label)}</h2><div class="scene-prose">${prose}</div></section>`,
  };
}

function buildContentDocument(document: EpubContentDocument, languageTag: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${languageTag}" lang="${languageTag}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(document.title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles.css" />
</head>
<body>${document.body}</body>
</html>`;
}

function buildNavigationDocument({
  title,
  languageTag,
  entries,
}: {
  title: string;
  languageTag: string;
  entries: EpubNavigationEntry[];
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${languageTag}" lang="${languageTag}">
<head><meta charset="UTF-8" /><title>${escapeXml(title)}</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${renderNavigationEntries(entries)}</ol></nav></body>
</html>`;
}

function renderNavigationEntries(entries: EpubNavigationEntry[]): string {
  return entries.map((entry) => {
    const children = entry.children.length > 0
      ? `<ol>${renderNavigationEntries(entry.children)}</ol>`
      : '';
    return `<li><a href="${escapeAttribute(entry.href)}">${escapeXml(entry.label)}</a>${children}</li>`;
  }).join('');
}

function buildPackageDocument({
  manuscript,
  languageTag,
  documents,
}: {
  manuscript: ManuscriptExportDocument;
  languageTag: string;
  documents: EpubContentDocument[];
}): string {
  const manifestItems = documents.map((document) =>
    `<item id="${document.id}" href="${document.fileName}" media-type="application/xhtml+xml" />`,
  ).join('');
  const spineItems = documents.map((document) => `<itemref idref="${document.id}" />`).join('');
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="publication-id" xml:lang="${languageTag}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="publication-id">${escapeXml(manuscript.book.id)}</dc:identifier>
  <dc:title>${escapeXml(manuscript.book.title)}</dc:title>
  <dc:creator>${escapeXml(manuscript.book.author)}</dc:creator>
  <dc:language>${languageTag}</dc:language>
  <meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
  <item id="styles" href="styles.css" media-type="text/css" />
  ${manifestItems}
</manifest>
<spine>${spineItems}</spine>
</package>`;
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
      return '<hr />';
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
      return '<br />';
    }
    if (node.type !== 'text') {
      throw unsupportedNodeError(node.type, context.sceneId);
    }
    return renderTextNode(node, context);
  }).join('');
}

function renderTextNode(node: TiptapNode, context: RenderContext): string {
  let content = escapeXml(node.text ?? '').replace(/\n/g, '<br />');
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

function resolveLanguageTag(language: string): string {
  const normalizedLanguage = language.trim().toLocaleLowerCase('en-US');
  const languageTag = LANGUAGE_TAGS[normalizedLanguage];
  if (!languageTag) {
    throw new Error(`Unsupported EPUB language "${language}".`);
  }
  return languageTag;
}

function structureLabel(kind: string, number: number, title: string | null): string {
  return title ? `${kind} ${number} — ${title}` : `${kind} ${number}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeXml(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unsupportedNodeError(nodeType: string, sceneId: string): Error {
  return new Error(`Unsupported Tiptap node "${nodeType}" in scene "${sceneId}".`);
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;

const EPUB_STYLES = `
body {
  margin: 5%;
  font-family: "Times New Roman", serif;
  line-height: 2;
}

.title-page,
.act {
  padding-top: 30%;
  text-align: center;
}

.title-page h1,
.title-page p,
.act h1,
.act h2,
.chapter > h1,
.scene > h2 {
  text-align: center;
  text-indent: 0;
}

.chapter > h1,
.scene > h2,
.prose-heading {
  page-break-after: avoid;
}

.scene > h2 {
  margin-top: 2em;
}

.scene-prose p {
  margin: 0;
  text-indent: 0.5in;
}

ul,
ol {
  padding-left: 2em;
}

li > p,
blockquote p,
blockquote .prose-heading {
  text-indent: 0;
}

blockquote {
  margin: 0 2em;
  font-style: italic;
}

pre,
code {
  font-family: "Courier New", monospace;
}

pre {
  padding: 0.5em;
  white-space: pre-wrap;
}
`;
