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
  const executeJavaScript = vi.fn();
  const setContentSize = vi.fn();
  const getContentSize = vi.fn();
  const capturePage = vi.fn();
  const isEmpty = vi.fn();
  const toPNG = vi.fn();
  const destroy = vi.fn();
  const isDestroyed = vi.fn();
  const image = { isEmpty, toPNG };
  const window = {
    loadURL,
    setContentSize,
    getContentSize,
    webContents: { executeJavaScript, capturePage },
    destroy,
    isDestroyed,
  };
  const BrowserWindow = vi.fn(function BrowserWindowMock() {
    return window;
  });

  return {
    BrowserWindow,
    capturePage,
    destroy,
    executeJavaScript,
    getContentSize,
    image,
    isDestroyed,
    isEmpty,
    loadURL,
    setContentSize,
    toPNG,
  };
});

vi.mock('electron', () => ({ BrowserWindow: electronMocks.BrowserWindow }));

import { exportManuscriptToPng } from '../png-exporter';

const book: ManuscriptExportBook = {
  id: 'book-1',
  title: 'A Tale & More',
  author: 'A. Writer',
  language: 'english',
};

describe('exportManuscriptToPng', () => {
  beforeEach(() => {
    electronMocks.BrowserWindow.mockClear();
    electronMocks.loadURL.mockReset().mockResolvedValue(undefined);
    electronMocks.executeJavaScript.mockReset().mockResolvedValue(900);
    electronMocks.setContentSize.mockReset();
    electronMocks.getContentSize.mockReset().mockReturnValue([1200, 900]);
    electronMocks.capturePage.mockReset().mockResolvedValue(electronMocks.image);
    electronMocks.isEmpty.mockReset().mockReturnValue(false);
    electronMocks.toPNG.mockReset().mockReturnValue(Buffer.from('png-test'));
    electronMocks.destroy.mockReset();
    electronMocks.isDestroyed.mockReset().mockReturnValue(false);
  });

  it('renders a dark themed book and captures one fixed-width full-height PNG', async () => {
    const result = await exportManuscriptToPng(createBookDocument([createAct()]));
    const html = loadedHtml();

    expect(result.toString()).toBe('png-test');
    expect(electronMocks.BrowserWindow).toHaveBeenCalledWith({
      show: false,
      width: 1200,
      height: 800,
      useContentSize: true,
      backgroundColor: '#121212',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    expect(html).toContain('background: #121212');
    expect(html).toContain('color: #fdf8f5');
    expect(html).toContain('background: #202020');
    expect(html).toContain('color: #bbaaaa');
    expect(html).toContain('width: 1200px');
    expect(html).toContain('<header class="book-title">');
    expect(html).toContain('<h1>A Tale &amp; More</h1>');
    expect(html).toContain('<p>by A. Writer</p>');
    expect(html.indexOf('ACT 1')).toBeLessThan(html.indexOf('Chapter 2'));
    expect(html.indexOf('Chapter 2')).toBeLessThan(html.indexOf('Scene 3'));
    expect(electronMocks.setContentSize).toHaveBeenCalledWith(1200, 900);
    expect(electronMocks.capturePage).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 1200,
      height: 900,
    });
    expect(electronMocks.toPNG).toHaveBeenCalledOnce();
    expect(electronMocks.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    ['act', createAct(), 'ACT 1'],
    ['chapter', createChapter(), 'Chapter 2'],
    ['scene', createScene(), 'Scene 3'],
  ] as const)('starts a partial %s export at the selected node', async (mode, node, label) => {
    await exportManuscriptToPng(createDocument(mode, [node]));

    const html = loadedHtml();
    expect(html).not.toContain('class="book-title"');
    expect(html).toContain(label);
  });

  it('preserves supported prose and omits AI workflow nodes', async () => {
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
        { type: 'heading', attrs: { level: 6 }, content: [{ type: 'text', text: 'Heading 6' }] },
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

    await exportManuscriptToPng(createDocument('scene', [createScene(prose)]));
    const html = loadedHtml();

    expect(html).toContain('<u><s><em><strong>bold &amp; &lt;Unicode: ășț&gt;</strong></em></s></u>');
    expect(html).toContain('<br>');
    expect(html).toContain('<code>inline</code>');
    expect(html).toContain(
      '<a href="https://example.com/?a=1&amp;b=&quot;two&quot;">linked</a>',
    );
    expect(html).toContain('<h6 class="prose-heading">Heading 6</h6>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol start="3">');
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
  ] as Array<[TiptapNode, string]>)(
    'rejects invalid prose before creating a render window: %s',
    async (node, message) => {
      const document = createDocument('scene', [createScene({ type: 'doc', content: [node] })]);

      await expect(exportManuscriptToPng(document)).rejects.toThrow(message);
      expect(electronMocks.BrowserWindow).not.toHaveBeenCalled();
    },
  );

  it.each([
    [0, 'PNG export could not determine a valid manuscript height.'],
    [1.5, 'PNG export could not determine a valid manuscript height.'],
    [32768, 'PNG export height 32768px exceeds the single-image limit of 32767px.'],
  ])('rejects an invalid measured height of %s', async (height, message) => {
    electronMocks.executeJavaScript.mockResolvedValue(height);

    await expect(exportManuscriptToPng(createBookDocument([]))).rejects.toThrow(message);
    expect(electronMocks.capturePage).not.toHaveBeenCalled();
    expect(electronMocks.destroy).toHaveBeenCalledOnce();
  });

  it('rejects a capture surface that Electron cannot size exactly', async () => {
    electronMocks.getContentSize.mockReturnValue([1200, 899]);

    await expect(exportManuscriptToPng(createBookDocument([]))).rejects.toThrow(
      'PNG export could not create the required 1200x900 capture surface.',
    );
    expect(electronMocks.capturePage).not.toHaveBeenCalled();
  });

  it('rejects an empty image returned by Electron', async () => {
    electronMocks.isEmpty.mockReturnValue(true);

    await expect(exportManuscriptToPng(createBookDocument([]))).rejects.toThrow(
      'PNG export produced an empty image.',
    );
    expect(electronMocks.toPNG).not.toHaveBeenCalled();
  });

  it.each(['load', 'measure', 'resize', 'capture'] as const)(
    'destroys the render window when %s fails',
    async (stage) => {
      const error = new Error(`${stage} failed`);
      if (stage === 'load') {
        electronMocks.loadURL.mockRejectedValue(error);
      } else if (stage === 'measure') {
        electronMocks.executeJavaScript.mockRejectedValue(error);
      } else if (stage === 'resize') {
        electronMocks.setContentSize.mockImplementation(() => { throw error; });
      } else {
        electronMocks.capturePage.mockRejectedValue(error);
      }

      await expect(exportManuscriptToPng(createBookDocument([]))).rejects.toThrow(`${stage} failed`);
      expect(electronMocks.destroy).toHaveBeenCalledOnce();
    },
  );

  it('does not destroy a window that Electron already destroyed', async () => {
    electronMocks.isDestroyed.mockReturnValue(true);

    await exportManuscriptToPng(createBookDocument([]));

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

function createScene(prose: TiptapJsonDoc = defaultProse()): ManuscriptExportScene {
  return {
    type: 'scene',
    id: 'scene-1',
    number: 3,
    title: 'Scene title',
    prose,
  };
}

function defaultProse(): TiptapJsonDoc {
  return { type: 'doc', content: [paragraphNode('Opening prose.')] };
}

function paragraphNode(text: string): TiptapNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}
