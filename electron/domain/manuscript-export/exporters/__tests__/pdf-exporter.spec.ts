import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TiptapJsonDoc, TiptapNode } from '../../../../../shared/models/manuscript.model';
import type {
  ManuscriptExportAct,
  ManuscriptExportBook,
  ManuscriptExportChapter,
  ManuscriptExportDocument,
  ManuscriptExportScene,
} from '../../models';

const electronMocks = vi.hoisted(() => {
  const loadURL = vi.fn();
  const printToPDF = vi.fn();
  const destroy = vi.fn();
  const isDestroyed = vi.fn();
  const window = {
    loadURL,
    webContents: { printToPDF },
    destroy,
    isDestroyed,
  };
  const BrowserWindow = vi.fn(function BrowserWindowMock() {
    return window;
  });

  return { BrowserWindow, destroy, isDestroyed, loadURL, printToPDF };
});

vi.mock('electron', () => ({ BrowserWindow: electronMocks.BrowserWindow }));

import { exportManuscriptToPdf } from '../pdf-exporter';

const book: ManuscriptExportBook = {
  id: 'book-1',
  title: 'A Tale & More',
  author: 'A. Writer',
  language: 'english',
};

describe('exportManuscriptToPdf', () => {
  beforeEach(() => {
    electronMocks.BrowserWindow.mockClear();
    electronMocks.loadURL.mockReset().mockResolvedValue(undefined);
    electronMocks.printToPDF.mockReset().mockResolvedValue(Buffer.from('%PDF-test'));
    electronMocks.destroy.mockReset();
    electronMocks.isDestroyed.mockReset().mockReturnValue(false);
  });

  it('renders a styled book manuscript and returns the generated PDF buffer', async () => {
    const document = createBookDocument([createAct()]);

    const result = await exportManuscriptToPdf(document);
    const html = loadedHtml();

    expect(result.toString()).toBe('%PDF-test');
    expect(electronMocks.BrowserWindow).toHaveBeenCalledWith({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    expect(electronMocks.printToPDF).toHaveBeenCalledWith({
      printBackground: true,
      preferCSSPageSize: true,
    });
    expect(electronMocks.destroy).toHaveBeenCalledOnce();
    expect(html).toContain('@page');
    expect(html).toContain('size: Letter portrait');
    expect(html).toContain('margin: 1in');
    expect(html).toContain('font-family: "Times New Roman"');
    expect(html).toContain('font-size: 12pt');
    expect(html).toContain('line-height: 2');
    expect(html).toContain('text-indent: 0.5in');
    expect(html).toContain('<section class="title-page">');
    expect(html).toContain('<h1>A Tale &amp; More</h1>');
    expect(html).toContain('<p>by A. Writer</p>');
    expect(html).toContain('ACT 1');
    expect(html).toContain('Act title');
    expect(html).toContain('Chapter 2 — Chapter title');
    expect(html).toContain('Scene 3 — Scene title');
    expect(html).toContain('Opening prose.');
  });

  it('starts partial exports at the selected node without a title page', async () => {
    await exportManuscriptToPdf(createDocument('chapter', [createChapter()]));
    const chapterHtml = loadedHtml();

    expect(chapterHtml).not.toContain('class="title-page"');
    expect(chapterHtml.indexOf('Chapter 2')).toBeLessThan(chapterHtml.indexOf('Scene 3'));

    electronMocks.loadURL.mockClear();
    await exportManuscriptToPdf(createDocument('scene', [createScene()]));
    const sceneHtml = loadedHtml();

    expect(sceneHtml).not.toContain('class="title-page"');
    expect(sceneHtml).toContain('Scene 3 — Scene title');
    expect(sceneHtml).toContain('.export-root > .scene:first-child');
  });

  it('does not add manuscript structure after an empty book title page', async () => {
    await exportManuscriptToPdf(createBookDocument([]));

    const html = loadedHtml();
    expect(html).toContain('class="title-page"');
    expect(html).not.toContain('class="act"');
    expect(html).not.toContain('class="chapter"');
    expect(html).not.toContain('class="scene"');
  });

  it('preserves StarterKit blocks, marks, Unicode, links, and nested list starts', async () => {
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
        { type: 'blockquote', content: [paragraphNode('Quoted prose')] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'const value = 1;\nreturn value;' }] },
        { type: 'horizontalRule' },
        { type: 'paragraph' },
        { type: 'aiPrompt', attrs: { prompt: 'Hidden prompt' } },
        { type: 'aiGeneratedBlock', content: [paragraphNode('Hidden generated prose')] },
      ],
    };

    await exportManuscriptToPdf(createDocument('scene', [createScene(prose)]));
    const html = loadedHtml();

    expect(html).toContain('<u><s><em><strong>bold &amp; &lt;Unicode: ășț&gt;</strong></em></s></u>');
    expect(html).toContain('<br>');
    expect(html).toContain('<code>inline</code>');
    expect(html).toContain(
      '<a href="https://example.com/?a=1&amp;b=&quot;two&quot;">linked</a>',
    );
    expect(html).toContain('<h1 class="prose-heading">Heading 1</h1>');
    expect(html).toContain('<h6 class="prose-heading">Heading 6</h6>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol start="3">');
    expect(html).toContain('Nested third');
    expect(html).toContain('<blockquote><p>Quoted prose</p></blockquote>');
    expect(html).toContain('<pre><code>const value = 1;<br>return value;</code></pre>');
    expect(html).toContain('<hr>');
    expect(html).toContain('<p></p>');
    expect(html).not.toContain('Hidden prompt');
    expect(html).not.toContain('Hidden generated prose');
  });

  it.each([
    [
      { type: 'unsupportedBlock' },
      'Unsupported Tiptap node "unsupportedBlock" in scene "scene-1".',
    ],
    [
      { type: 'heading', attrs: { level: 7 } },
      'Unsupported Tiptap heading level "7" in scene "scene-1".',
    ],
    [
      { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }] },
      'Unsupported Tiptap mark "highlight" in scene "scene-1".',
    ],
    [
      { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link' }] }] },
      'Invalid Tiptap link mark in scene "scene-1": href is required.',
    ],
    [
      { type: 'bulletList', content: [{ type: 'paragraph' }] },
      'Unsupported Tiptap node "paragraph" in scene "scene-1".',
    ],
  ] as Array<[TiptapNode, string]>)(
    'rejects invalid prose before creating a render window: %s',
    async (node, message) => {
      const document = createDocument('scene', [createScene({ type: 'doc', content: [node] })]);

      await expect(exportManuscriptToPdf(document)).rejects.toThrow(message);
      expect(electronMocks.BrowserWindow).not.toHaveBeenCalled();
    },
  );

  it('destroys the render window when loading or printing fails', async () => {
    electronMocks.loadURL.mockRejectedValueOnce(new Error('load failed'));

    await expect(exportManuscriptToPdf(createBookDocument([]))).rejects.toThrow('load failed');
    expect(electronMocks.destroy).toHaveBeenCalledOnce();

    electronMocks.destroy.mockClear();
    electronMocks.printToPDF.mockRejectedValueOnce(new Error('print failed'));

    await expect(exportManuscriptToPdf(createBookDocument([]))).rejects.toThrow('print failed');
    expect(electronMocks.destroy).toHaveBeenCalledOnce();
  });

  it('does not destroy a window that Electron already destroyed', async () => {
    electronMocks.isDestroyed.mockReturnValue(true);

    await exportManuscriptToPdf(createBookDocument([]));

    expect(electronMocks.destroy).not.toHaveBeenCalled();
  });
});

function loadedHtml(): string {
  const url = electronMocks.loadURL.mock.calls.at(-1)?.[0] as string;
  const prefix = 'data:text/html;charset=utf-8,';
  expect(url.startsWith(prefix)).toBe(true);
  return decodeURIComponent(url.slice(prefix.length));
}

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
