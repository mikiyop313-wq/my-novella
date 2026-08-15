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
import { exportManuscriptToDocx } from '../docx-exporter';

const book: ManuscriptExportBook = {
  id: 'book-1',
  title: 'A Tale & More',
  author: 'A. Writer',
};

describe('exportManuscriptToDocx', () => {
  it('creates a styled book manuscript with title, act, chapter, and scene structure', async () => {
    const document = createBookDocument([createAct()]);

    const archive = await exportArchive(document);
    const documentXml = await archiveText(archive, 'word/document.xml');
    const stylesXml = await archiveText(archive, 'word/styles.xml');
    const coreXml = await archiveText(archive, 'docProps/core.xml');

    expect(documentXml).toContain('A Tale &amp; More');
    expect(documentXml).toContain('by A. Writer');
    expect(documentXml).toContain('ACT 1');
    expect(documentXml).toContain('Act title');
    expect(documentXml).toContain('Chapter 2 — Chapter title');
    expect(documentXml).toContain('Scene 3 — Scene title');
    expect(documentXml).toContain('Opening prose.');
    expect(count(documentXml, '<w:br w:type="page"/>')).toBe(2);
    expect(documentXml).toContain('<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>');
    expect(documentXml).toContain(
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"',
    );
    expect(stylesXml).toContain('<w:rFonts w:ascii="Times New Roman"');
    expect(stylesXml).toContain('<w:spacing w:line="480" w:lineRule="auto"/>');
    expect(stylesXml).toContain('<w:ind w:firstLine="720"/>');
    expect(coreXml).toContain('<dc:title>A Tale &amp; More</dc:title>');
    expect(coreXml).toContain('<dc:creator>A. Writer</dc:creator>');
  });

  it('starts partial exports at the selected node without a title page or leading page break', async () => {
    const chapter = createChapter();
    const scene = createScene();

    const chapterXml = await documentXml(createDocument('chapter', [chapter]));
    const sceneXml = await documentXml(createDocument('scene', [scene]));

    expect(chapterXml).not.toContain('by A. Writer');
    expect(chapterXml).not.toContain('<w:br w:type="page"/>');
    expect(chapterXml.indexOf('Chapter 2')).toBeLessThan(chapterXml.indexOf('Scene 3'));
    expect(sceneXml).not.toContain('by A. Writer');
    expect(sceneXml).not.toContain('<w:br w:type="page"/>');
    expect(sceneXml).toContain('Scene 3 — Scene title');
  });

  it('does not add a trailing blank page to an empty book export', async () => {
    const xml = await documentXml(createBookDocument([]));

    expect(xml).toContain('A Tale &amp; More');
    expect(xml).not.toContain('<w:br w:type="page"/>');
  });

  it('preserves StarterKit blocks, inline marks, links, nested lists, and list starts', async () => {
    const prose: TiptapJsonDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'combined',
              marks: [
                { type: 'bold' },
                { type: 'italic' },
                { type: 'strike' },
                { type: 'underline' },
              ],
            },
            { type: 'hardBreak' },
            { type: 'text', text: 'code', marks: [{ type: 'code' }] },
            {
              type: 'text',
              text: 'link',
              marks: [
                { type: 'bold' },
                { type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } },
              ],
            },
            { type: 'text', text: '<escaped>' },
          ],
        },
        ...headingNodes(),
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                paragraphNode('Bullet item'),
                {
                  type: 'orderedList',
                  attrs: { start: 3 },
                  content: [{ type: 'listItem', content: [paragraphNode('Nested third')] }],
                },
              ],
            },
          ],
        },
        {
          type: 'orderedList',
          content: [{ type: 'listItem', content: [paragraphNode('Separate first')] }],
        },
        { type: 'blockquote', content: [paragraphNode('Quoted prose')] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'const value = 1;\nreturn value;' }] },
        { type: 'horizontalRule' },
        { type: 'paragraph' },
        { type: 'aiPrompt', attrs: { prompt: 'Hidden prompt' } },
        {
          type: 'aiGeneratedBlock',
          content: [paragraphNode('Hidden generated prose')],
        },
      ],
    };

    const archive = await exportArchive(createDocument('scene', [createScene(prose)]));
    const documentXml = await archiveText(archive, 'word/document.xml');
    const numberingXml = await archiveText(archive, 'word/numbering.xml');
    const relationshipsXml = await archiveText(archive, 'word/_rels/document.xml.rels');

    expect(documentXml).toContain('<w:b/>');
    expect(documentXml).toContain('<w:i/>');
    expect(documentXml).toContain('<w:strike/>');
    expect(documentXml).toContain('<w:u w:val="single"/>');
    expect(documentXml).toContain('<w:br/>');
    expect(documentXml).toContain('Courier New');
    expect(documentXml).toContain('&lt;escaped&gt;');
    expect(documentXml).toContain('Heading 1');
    expect(documentXml).toContain('Heading 6');
    expect(documentXml).toContain('Bullet item');
    expect(documentXml).toContain('Nested third');
    expect(documentXml).toContain('Separate first');
    expect(documentXml).toContain('Quoted prose');
    expect(documentXml).toContain('const value = 1;');
    expect(documentXml).toContain('return value;');
    expect(documentXml).toContain('<w:pBdr>');
    expect(documentXml).not.toContain('Hidden prompt');
    expect(documentXml).not.toContain('Hidden generated prose');
    expect(numberingXml).toContain('<w:start w:val="3"/>');
    expect(count(numberingXml, '<w:abstractNum ')).toBeGreaterThanOrEqual(3);
    expect(relationshipsXml).toContain('Target="https://example.com/?a=1&amp;b=2"');
    expect(relationshipsXml).toContain('TargetMode="External"');
  });

  it.each([
    [
      { type: 'unsupportedBlock' },
      'Unsupported Tiptap node "unsupportedBlock" in scene "scene-1".',
    ],
    [
      { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }] },
      'Unsupported Tiptap mark "highlight" in scene "scene-1".',
    ],
    [
      { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link' }] }] },
      'Invalid Tiptap link mark in scene "scene-1": href is required.',
    ],
  ] as Array<[TiptapNode, string]>)(
    'rejects invalid prose instead of losing it: %s',
    async (node, message) => {
      const document = createDocument('scene', [createScene({ type: 'doc', content: [node] })]);

      await expect(exportManuscriptToDocx(document)).rejects.toThrow(message);
    },
  );
});

function createBookDocument(acts: ManuscriptExportAct[]): ManuscriptExportDocument {
  return {
    target: { mode: 'book', id: book.id },
    book,
    nodes: acts,
  };
}

function createDocument(
  mode: 'act' | 'chapter' | 'scene',
  nodes: ManuscriptExportDocument['nodes'],
): ManuscriptExportDocument {
  return {
    target: { mode, id: nodes[0]?.id ?? 'target-1' },
    book,
    nodes,
  };
}

function createAct(): ManuscriptExportAct {
  return {
    type: 'act',
    id: 'act-1',
    number: 1,
    title: 'Act title',
    chapters: [createChapter()],
  };
}

function createChapter(): ManuscriptExportChapter {
  return {
    type: 'chapter',
    id: 'chapter-1',
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
  const buffer = await exportManuscriptToDocx(document);
  expect(buffer.subarray(0, 2).toString()).toBe('PK');
  return JSZip.loadAsync(buffer);
}

async function documentXml(document: ManuscriptExportDocument): Promise<string> {
  return archiveText(await exportArchive(document), 'word/document.xml');
}

async function archiveText(archive: JSZip, path: string): Promise<string> {
  const file = archive.file(path);
  expect(file, `Expected ${path} in DOCX archive`).not.toBeNull();
  return file!.async('string');
}

function count(text: string, value: string): number {
  return text.split(value).length - 1;
}
