import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import type { TiptapJsonDoc, TiptapNode } from '../../../../../shared/models/manuscript.model';
import type {
  ManuscriptExportAct,
  ManuscriptExportBook,
  ManuscriptExportChapter,
  ManuscriptExportDocument,
  ManuscriptExportScene,
} from '../../models';
import { exportManuscriptToEpub } from '../epub-exporter';

const book: ManuscriptExportBook = {
  id: 'book-&-1',
  title: 'A Tale & More',
  author: 'A. Writer',
  language: 'romanian',
};

describe('exportManuscriptToEpub', () => {
  it('creates a conformant chapter-oriented EPUB with metadata, navigation, and spine', async () => {
    const buffer = await exportManuscriptToEpub(createBookDocument([createAct()]));
    const archive = await JSZip.loadAsync(buffer);
    const packageXml = await archiveText(archive, 'EPUB/package.opf');
    const navigation = await archiveText(archive, 'EPUB/nav.xhtml');
    const titlePage = await archiveText(archive, 'EPUB/text/title.xhtml');
    const actPage = await archiveText(archive, 'EPUB/text/act-1.xhtml');
    const chapterPage = await archiveText(archive, 'EPUB/text/chapter-1.xhtml');

    expect(buffer.readUInt32LE(0)).toBe(0x04034b50);
    expect(buffer.readUInt16LE(8)).toBe(0);
    expect(firstZipEntryName(buffer)).toBe('mimetype');
    expect(Object.keys(archive.files)[0]).toBe('mimetype');
    expect(await archiveText(archive, 'mimetype')).toBe('application/epub+zip');
    expect(await archiveText(archive, 'META-INF/container.xml')).toContain(
      'full-path="EPUB/package.opf"',
    );
    expect(await archiveText(archive, 'EPUB/styles.css')).toContain('line-height: 2');

    expect(packageXml).toContain('<dc:identifier id="publication-id">book-&amp;-1</dc:identifier>');
    expect(packageXml).toContain('<dc:title>A Tale &amp; More</dc:title>');
    expect(packageXml).toContain('<dc:creator>A. Writer</dc:creator>');
    expect(packageXml).toContain('<dc:language>ro</dc:language>');
    expect(packageXml).toMatch(/<meta property="dcterms:modified">\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/meta>/);
    expect(packageXml).toContain('id="nav" href="nav.xhtml"');
    expect(packageXml).toContain('id="styles" href="styles.css"');
    expect(spineIds(packageXml)).toEqual(['title-page', 'act-1', 'chapter-1']);

    expect(navigation).toContain('<a href="text/title.xhtml">A Tale &amp; More</a>');
    expect(navigation).toContain('<a href="text/act-1.xhtml">Act 1 — Act title</a>');
    expect(navigation).toContain('<a href="text/chapter-1.xhtml">Chapter 2 — Chapter title</a>');
    expect(navigation).toContain(
      '<a href="text/chapter-1.xhtml#scene-1">Scene 3 — Scene title</a>',
    );
    expect(navigation.indexOf('Act 1')).toBeLessThan(navigation.indexOf('Chapter 2'));
    expect(navigation.indexOf('Chapter 2')).toBeLessThan(navigation.indexOf('Scene 3'));

    expect(titlePage).toContain('<h1>A Tale &amp; More</h1><p>by A. Writer</p>');
    expect(titlePage).toContain('xml:lang="ro" lang="ro"');
    expect(actPage).toContain('<h1>ACT 1</h1><h2>Act title</h2>');
    expect(chapterPage).toContain('<section id="scene-1" class="scene">');
    expect(chapterPage).toContain('Opening prose.');
  });

  it.each([
    ['act', [createAct()], ['act-1', 'chapter-1'], 'EPUB/text/act-1.xhtml'],
    ['chapter', [createChapter()], ['chapter-1'], 'EPUB/text/chapter-1.xhtml'],
    ['scene', [createScene()], ['scene-document'], 'EPUB/text/scene.xhtml'],
  ] as Array<[
    'act' | 'chapter' | 'scene',
    ManuscriptExportDocument['nodes'],
    string[],
    string,
  ]>)(
    'starts a partial %s export at the selected structure without a title page',
    async (mode, nodes, expectedSpine, expectedFile) => {
      const archive = await exportArchive(createDocument(mode, nodes));
      const packageXml = await archiveText(archive, 'EPUB/package.opf');

      expect(archive.file('EPUB/text/title.xhtml')).toBeNull();
      expect(spineIds(packageXml)).toEqual(expectedSpine);
      expect(archive.file(expectedFile)).not.toBeNull();
    },
  );

  it('keeps an empty book valid with a title page and non-empty navigation', async () => {
    const archive = await exportArchive(createBookDocument([]));
    const packageXml = await archiveText(archive, 'EPUB/package.opf');
    const navigation = await archiveText(archive, 'EPUB/nav.xhtml');

    expect(spineIds(packageXml)).toEqual(['title-page']);
    expect(navigation).toContain('<ol><li><a href="text/title.xhtml">');
    expect(archive.file('EPUB/text/act-1.xhtml')).toBeNull();
  });

  it('preserves supported Tiptap formatting and ignores AI workflow nodes', async () => {
    const prose: TiptapJsonDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'bold & <Unicode: ășț>',
              marks: [
                { type: 'bold' },
                { type: 'italic' },
                { type: 'strike' },
                { type: 'underline' },
              ],
            },
            { type: 'hardBreak' },
            { type: 'text', text: 'inline', marks: [{ type: 'code' }] },
            {
              type: 'text',
              text: 'linked',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/?a=1&b="two"' } }],
            },
          ],
        },
        ...headingNodes(),
        {
          type: 'bulletList',
          content: [{
            type: 'listItem',
            content: [
              paragraphNode('Bullet item'),
              {
                type: 'orderedList',
                attrs: { start: 3 },
                content: [{ type: 'listItem', content: [paragraphNode('Nested third')] }],
              },
            ],
          }],
        },
        { type: 'blockquote', content: [paragraphNode('Quoted prose')] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'const value = 1;\nreturn value;' }] },
        { type: 'horizontalRule' },
        { type: 'paragraph' },
        { type: 'aiPrompt', attrs: { prompt: 'Hidden prompt' } },
        { type: 'aiGeneratedBlock', content: [paragraphNode('Hidden generated prose')] },
      ],
    };
    const archive = await exportArchive(createDocument('scene', [createScene(prose)]));
    const xhtml = await archiveText(archive, 'EPUB/text/scene.xhtml');

    expect(xhtml).toContain('<u><s><em><strong>bold &amp; &lt;Unicode: ășț&gt;</strong></em></s></u>');
    expect(xhtml).toContain('<br />');
    expect(xhtml).toContain('<code>inline</code>');
    expect(xhtml).toContain('<a href="https://example.com/?a=1&amp;b=&quot;two&quot;">linked</a>');
    expect(xhtml).toContain('<h1 class="prose-heading">Heading 1</h1>');
    expect(xhtml).toContain('<h6 class="prose-heading">Heading 6</h6>');
    expect(xhtml).toContain('<ul><li><p>Bullet item</p><ol start="3">');
    expect(xhtml).toContain('<blockquote><p>Quoted prose</p></blockquote>');
    expect(xhtml).toContain('<pre><code>const value = 1;<br />return value;</code></pre>');
    expect(xhtml).toContain('<hr />');
    expect(xhtml).not.toContain('Hidden prompt');
    expect(xhtml).not.toContain('Hidden generated prose');
  });

  it.each([
    [{ type: 'unsupportedBlock' }, 'Unsupported Tiptap node "unsupportedBlock" in scene "scene-1".'],
    [
      { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }] },
      'Unsupported Tiptap mark "highlight" in scene "scene-1".',
    ],
    [
      { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link' }] }] },
      'Invalid Tiptap link mark in scene "scene-1": href is required.',
    ],
    [
      { type: 'heading', attrs: { level: 7 } },
      'Unsupported Tiptap heading level "7" in scene "scene-1".',
    ],
  ] as Array<[TiptapNode, string]>)(
    'rejects invalid prose instead of losing it: %s',
    async (node, message) => {
      const document = createDocument('scene', [
        createScene({ type: 'doc', content: [node] }),
      ]);
      await expect(exportManuscriptToEpub(document)).rejects.toThrow(message);
    },
  );

  it('rejects unknown project languages instead of applying a fallback', async () => {
    const document = createBookDocument([]);
    document.book = { ...document.book, language: 'Klingon' };

    await expect(exportManuscriptToEpub(document)).rejects.toThrow(
      'Unsupported EPUB language "Klingon".',
    );
  });

  it.each([
    ['English', 'en'],
    ['Chinese (Traditional)', 'zh-Hant'],
    ['Norwegian (Bokmål)', 'nb'],
    ['Portuguese (Brazil)', 'pt-BR'],
    ['Filipino (Tagalog)', 'tl'],
  ])('maps the seeded language %s to %s', async (language, expectedTag) => {
    const document = createBookDocument([]);
    document.book = { ...document.book, language };
    const packageXml = await archiveText(await exportArchive(document), 'EPUB/package.opf');

    expect(packageXml).toContain(`<dc:language>${expectedTag}</dc:language>`);
  });
});

function createBookDocument(acts: ManuscriptExportAct[]): ManuscriptExportDocument {
  return { target: { mode: 'book', id: book.id }, book, nodes: acts };
}

function createDocument(
  mode: 'act' | 'chapter' | 'scene',
  nodes: ManuscriptExportDocument['nodes'],
): ManuscriptExportDocument {
  return { target: { mode, id: nodes[0]?.id ?? 'target-1' }, book, nodes };
}

function createAct(): ManuscriptExportAct {
  return {
    type: 'act',
    id: 'database-act-id',
    number: 1,
    title: 'Act title',
    chapters: [createChapter()],
  };
}

function createChapter(): ManuscriptExportChapter {
  return {
    type: 'chapter',
    id: 'database-chapter-id',
    number: 2,
    title: 'Chapter title',
    scenes: [createScene()],
  };
}

function createScene(prose: TiptapJsonDoc = proseDocument()): ManuscriptExportScene {
  return {
    type: 'scene',
    id: 'scene-1',
    number: 3,
    title: 'Scene title',
    prose,
  };
}

function proseDocument(): TiptapJsonDoc {
  return { type: 'doc', content: [paragraphNode('Opening prose.')] };
}

function paragraphNode(text: string): TiptapNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function headingNodes(): TiptapNode[] {
  return Array.from({ length: 6 }, (_, index) => ({
    type: 'heading',
    attrs: { level: index + 1 },
    content: [{ type: 'text', text: `Heading ${index + 1}` }],
  }));
}

async function exportArchive(document: ManuscriptExportDocument): Promise<JSZip> {
  return JSZip.loadAsync(await exportManuscriptToEpub(document));
}

async function archiveText(archive: JSZip, path: string): Promise<string> {
  const file = archive.file(path);
  expect(file, `Expected ${path} in EPUB archive`).not.toBeNull();
  return file!.async('string');
}

function firstZipEntryName(buffer: Buffer): string {
  const nameLength = buffer.readUInt16LE(26);
  return buffer.subarray(30, 30 + nameLength).toString('utf8');
}

function spineIds(packageXml: string): string[] {
  return [...packageXml.matchAll(/<itemref idref="([^"]+)" \/>/g)].map((match) => match[1]!);
}
