import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  TextRun,
  UnderlineType,
} from 'docx';
import type {
  FileChild,
  ILevelsOptions,
  IParagraphOptions,
  IRunPropertiesOptions,
  ParagraphChild,
} from 'docx';

import type { TiptapMark, TiptapNode } from '../../../../shared/models/manuscript.model';
import type {
  ManuscriptExportAct,
  ManuscriptExportChapter,
  ManuscriptExportDocument,
  ManuscriptExportNode,
  ManuscriptExportScene,
} from '../models';

const FONT_FAMILY = 'Times New Roman';
const MONOSPACE_FONT_FAMILY = 'Courier New';
const BODY_FONT_SIZE = 24;
const DOUBLE_LINE_SPACING = 480;
const HALF_INCH = 720;
const ONE_INCH = 1440;
const LETTER_PAGE_WIDTH = 12240;
const LETTER_PAGE_HEIGHT = 15840;
const MAX_LIST_DEPTH = 8;
const IGNORED_NODE_TYPES = new Set(['aiPrompt', 'aiGeneratedBlock']);

const HEADING_LEVELS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
} as const;

interface NumberingConfiguration {
  reference: string;
  levels: ILevelsOptions[];
}

interface ListParagraphContext {
  kind: 'bullet' | 'ordered';
  depth: number;
  reference?: string;
  isFirstBlock: boolean;
}

interface RenderContext {
  sceneId: string;
  numbering: NumberingConfiguration[];
  nextNumberingId: number;
}

interface DocumentLayout {
  children: FileChild[];
  atPageStart: boolean;
}

/** Converts normalized manuscript content into a complete DOCX archive. */
export async function exportManuscriptToDocx(
  manuscript: ManuscriptExportDocument,
): Promise<Buffer> {
  const renderContext: RenderContext = {
    sceneId: '',
    numbering: [],
    nextNumberingId: 1,
  };
  const layout: DocumentLayout = { children: [], atPageStart: true };

  if (manuscript.target.mode === 'book') {
    appendTitlePage(layout, manuscript.book.title, manuscript.book.author);
    if (manuscript.nodes.length > 0) {
      appendPageBreak(layout);
    }
  }

  manuscript.nodes.forEach((node) => appendStructureNode(layout, node, renderContext));

  const document = new Document({
    title: manuscript.book.title,
    creator: manuscript.book.author,
    styles: {
      default: {
        document: {
          run: { font: FONT_FAMILY, size: BODY_FONT_SIZE },
          paragraph: {
            indent: { firstLine: HALF_INCH },
            spacing: { line: DOUBLE_LINE_SPACING, lineRule: LineRuleType.AUTO },
          },
        },
      },
    },
    numbering: { config: renderContext.numbering },
    sections: [
      {
        properties: {
          page: {
            size: { width: LETTER_PAGE_WIDTH, height: LETTER_PAGE_HEIGHT },
            margin: {
              top: ONE_INCH,
              right: ONE_INCH,
              bottom: ONE_INCH,
              left: ONE_INCH,
            },
          },
        },
        children: layout.children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

function appendTitlePage(layout: DocumentLayout, title: string, author: string): void {
  appendParagraph(
    layout,
    new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: { firstLine: 0 },
      spacing: { before: 4320, after: 480 },
      children: [new TextRun({ text: title, bold: true, size: 32, font: FONT_FAMILY })],
    }),
  );
  appendParagraph(
    layout,
    new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: { firstLine: 0 },
      children: [new TextRun({ text: `by ${author}`, size: BODY_FONT_SIZE, font: FONT_FAMILY })],
    }),
  );
}

function appendStructureNode(
  layout: DocumentLayout,
  node: ManuscriptExportNode,
  context: RenderContext,
): void {
  switch (node.type) {
    case 'act':
      appendAct(layout, node, context);
      return;
    case 'chapter':
      appendChapter(layout, node, context);
      return;
    case 'scene':
      appendScene(layout, node, context);
  }
}

function appendAct(layout: DocumentLayout, act: ManuscriptExportAct, context: RenderContext): void {
  appendPageBreak(layout);
  appendCenteredHeading(layout, `ACT ${act.number}`, 28, 4320);

  if (act.title) {
    appendCenteredHeading(layout, act.title, 28, 240);
  }

  act.chapters.forEach((chapter) => appendChapter(layout, chapter, context));
}

function appendChapter(
  layout: DocumentLayout,
  chapter: ManuscriptExportChapter,
  context: RenderContext,
): void {
  appendPageBreak(layout);
  appendCenteredHeading(layout, structureLabel('Chapter', chapter.number, chapter.title), 28, 720);
  chapter.scenes.forEach((scene) => appendScene(layout, scene, context));
}

function appendScene(
  layout: DocumentLayout,
  scene: ManuscriptExportScene,
  context: RenderContext,
): void {
  appendParagraph(
    layout,
    new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: { firstLine: 0 },
      spacing: { before: layout.atPageStart ? 0 : 480, after: 240 },
      keepNext: true,
      children: [
        new TextRun({
          text: structureLabel('Scene', scene.number, scene.title),
          bold: true,
          size: BODY_FONT_SIZE,
          font: FONT_FAMILY,
        }),
      ],
    }),
  );

  context.sceneId = scene.id;
  scene.prose.content.forEach((node) => {
    renderBlock(node, context).forEach((paragraph) => appendParagraph(layout, paragraph));
  });
}

function appendCenteredHeading(
  layout: DocumentLayout,
  text: string,
  fontSize: number,
  spacingBefore: number,
): void {
  appendParagraph(
    layout,
    new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: { firstLine: 0 },
      spacing: { before: spacingBefore, after: 240 },
      keepNext: true,
      children: [new TextRun({ text, bold: true, size: fontSize, font: FONT_FAMILY })],
    }),
  );
}

function appendParagraph(layout: DocumentLayout, paragraph: Paragraph): void {
  layout.children.push(paragraph);
  layout.atPageStart = false;
}

function appendPageBreak(layout: DocumentLayout): void {
  if (!layout.atPageStart) {
    layout.children.push(new Paragraph({ children: [new PageBreak()] }));
    layout.atPageStart = true;
  }
}

function structureLabel(kind: string, number: number, title: string | null): string {
  return title ? `${kind} ${number} — ${title}` : `${kind} ${number}`;
}

function renderBlock(
  node: TiptapNode,
  context: RenderContext,
  listContext?: ListParagraphContext,
): Paragraph[] {
  if (IGNORED_NODE_TYPES.has(node.type)) {
    return [];
  }

  switch (node.type) {
    case 'paragraph':
      return [renderTextParagraph(node, context, bodyParagraphOptions(listContext))];
    case 'heading':
      return [renderHeading(node, context, listContext)];
    case 'bulletList':
      return renderList(node, context, 'bullet', listContext?.depth ?? -1);
    case 'orderedList':
      return renderList(node, context, 'ordered', listContext?.depth ?? -1);
    case 'blockquote':
      return renderBlockquote(node, context, listContext);
    case 'codeBlock':
      return [renderCodeBlock(node, context, listContext)];
    case 'horizontalRule':
      return [
        new Paragraph({
          thematicBreak: true,
          indent: { firstLine: 0, left: listContinuationIndent(listContext) },
          spacing: { before: 240, after: 240 },
        }),
      ];
    default:
      throw unsupportedNodeError(node.type, context.sceneId);
  }
}

function renderTextParagraph(
  node: TiptapNode,
  context: RenderContext,
  options: IParagraphOptions,
): Paragraph {
  return new Paragraph({
    ...options,
    children: renderInlineContent(node.content ?? [], context),
  });
}

function renderHeading(
  node: TiptapNode,
  context: RenderContext,
  listContext?: ListParagraphContext,
): Paragraph {
  const rawLevel = node.attrs?.['level'];
  const level = typeof rawLevel === 'number' ? rawLevel : 1;
  const heading = HEADING_LEVELS[level as keyof typeof HEADING_LEVELS];

  if (!heading) {
    throw new Error(
      `Unsupported Tiptap heading level "${String(rawLevel)}" in scene "${context.sceneId}".`,
    );
  }

  return new Paragraph({
    ...listParagraphOptions(listContext),
    heading,
    indent: listContext ? listParagraphOptions(listContext).indent : { firstLine: 0 },
    spacing: { before: 240, after: 120, line: 240, lineRule: LineRuleType.AUTO },
    keepNext: true,
    run: { font: FONT_FAMILY, size: headingFontSize(level), bold: true },
    children: renderInlineContent(node.content ?? [], context),
  });
}

function renderBlockquote(
  node: TiptapNode,
  context: RenderContext,
  listContext?: ListParagraphContext,
): Paragraph[] {
  const left = listContinuationIndent(listContext) + HALF_INCH;
  const children = node.content ?? [];

  return children.flatMap((child) => {
    if (child.type !== 'paragraph' && child.type !== 'heading') {
      throw unsupportedNodeError(child.type, context.sceneId);
    }

    return [
      new Paragraph({
        indent: { firstLine: 0, left, right: HALF_INCH },
        spacing: { line: DOUBLE_LINE_SPACING, lineRule: LineRuleType.AUTO },
        run: { italics: true, font: FONT_FAMILY, size: BODY_FONT_SIZE },
        children: renderInlineContent(child.content ?? [], context),
      }),
    ];
  });
}

function renderCodeBlock(
  node: TiptapNode,
  context: RenderContext,
  listContext?: ListParagraphContext,
): Paragraph {
  const codeRunOptions: IRunPropertiesOptions = {
    font: MONOSPACE_FONT_FAMILY,
    size: 20,
    shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
  };

  return new Paragraph({
    indent: {
      firstLine: 0,
      left: listContinuationIndent(listContext) + 360,
      right: 360,
    },
    spacing: { before: 120, after: 120, line: 240, lineRule: LineRuleType.AUTO },
    shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
    children: renderInlineContent(node.content ?? [], context, codeRunOptions),
  });
}

function renderList(
  node: TiptapNode,
  context: RenderContext,
  kind: 'bullet' | 'ordered',
  parentDepth: number,
): Paragraph[] {
  const depth = Math.min(parentDepth + 1, MAX_LIST_DEPTH);
  const reference = kind === 'ordered' ? registerOrderedList(node, context) : undefined;

  return (node.content ?? []).flatMap((listItem) => {
    if (listItem.type !== 'listItem') {
      throw unsupportedNodeError(listItem.type, context.sceneId);
    }

    let hasRenderedFirstBlock = false;
    return (listItem.content ?? []).flatMap((child) => {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        return renderList(
          child,
          context,
          child.type === 'bulletList' ? 'bullet' : 'ordered',
          depth,
        );
      }

      const rendered = renderBlock(child, context, {
        kind,
        depth,
        reference,
        isFirstBlock: !hasRenderedFirstBlock,
      });
      if (rendered.length > 0) {
        hasRenderedFirstBlock = true;
      }
      return rendered;
    });
  });
}

function registerOrderedList(node: TiptapNode, context: RenderContext): string {
  const reference = `manuscript-ordered-list-${context.nextNumberingId}`;
  context.nextNumberingId += 1;
  const rawStart = node.attrs?.['start'];
  const start = typeof rawStart === 'number' && rawStart >= 1 ? rawStart : 1;

  context.numbering.push({
    reference,
    levels: Array.from({ length: MAX_LIST_DEPTH + 1 }, (_, level) => ({
      level,
      format: LevelFormat.DECIMAL,
      text: `%${level + 1}.`,
      start,
      alignment: AlignmentType.START,
      style: {
        paragraph: {
          indent: {
            left: (level + 1) * HALF_INCH,
            hanging: 360,
          },
        },
        run: { font: FONT_FAMILY, size: BODY_FONT_SIZE },
      },
    })),
  });

  return reference;
}

function bodyParagraphOptions(listContext?: ListParagraphContext): IParagraphOptions {
  return {
    ...listParagraphOptions(listContext),
    spacing: { line: DOUBLE_LINE_SPACING, lineRule: LineRuleType.AUTO },
  };
}

function listParagraphOptions(listContext?: ListParagraphContext): IParagraphOptions {
  if (!listContext) {
    return { indent: { firstLine: HALF_INCH } };
  }

  if (!listContext.isFirstBlock) {
    return {
      indent: {
        firstLine: 0,
        left: (listContext.depth + 1) * HALF_INCH,
      },
    };
  }

  if (listContext.kind === 'bullet') {
    return { bullet: { level: listContext.depth }, indent: { firstLine: 0 } };
  }

  return {
    numbering: {
      reference: listContext.reference as string,
      level: listContext.depth,
    },
    indent: { firstLine: 0 },
  };
}

function listContinuationIndent(listContext?: ListParagraphContext): number {
  return listContext ? (listContext.depth + 1) * HALF_INCH : 0;
}

function renderInlineContent(
  nodes: TiptapNode[],
  context: RenderContext,
  baseOptions: IRunPropertiesOptions = {},
): ParagraphChild[] {
  return nodes.flatMap((node) => {
    if (IGNORED_NODE_TYPES.has(node.type)) {
      return [];
    }

    if (node.type === 'hardBreak') {
      return [new TextRun({ ...baseOptions, break: 1 })];
    }

    if (node.type !== 'text') {
      throw unsupportedNodeError(node.type, context.sceneId);
    }

    return renderTextNode(node, context, baseOptions);
  });
}

function renderTextNode(
  node: TiptapNode,
  context: RenderContext,
  baseOptions: IRunPropertiesOptions,
): ParagraphChild[] {
  const options: IRunPropertiesOptions = { ...baseOptions };
  let link: string | undefined;

  (node.marks ?? []).forEach((mark) => {
    link = applyMark(mark, options, link, context.sceneId);
  });

  const runs = textRuns(node.text ?? '', options);
  return link ? [new ExternalHyperlink({ link, children: runs })] : runs;
}

function applyMark(
  mark: TiptapMark,
  options: IRunPropertiesOptions,
  currentLink: string | undefined,
  sceneId: string,
): string | undefined {
  switch (mark.type) {
    case 'bold':
      Object.assign(options, { bold: true });
      return currentLink;
    case 'italic':
      Object.assign(options, { italics: true });
      return currentLink;
    case 'strike':
      Object.assign(options, { strike: true });
      return currentLink;
    case 'underline':
      Object.assign(options, { underline: { type: UnderlineType.SINGLE } });
      return currentLink;
    case 'code':
      Object.assign(options, {
        font: MONOSPACE_FONT_FAMILY,
        shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
      });
      return currentLink;
    case 'link': {
      const href = mark.attrs?.['href'];
      if (typeof href !== 'string' || href.length === 0) {
        throw new Error(`Invalid Tiptap link mark in scene "${sceneId}": href is required.`);
      }
      return href;
    }
    default:
      throw new Error(`Unsupported Tiptap mark "${mark.type}" in scene "${sceneId}".`);
  }
}

function textRuns(text: string, options: IRunPropertiesOptions): TextRun[] {
  const lines = text.split('\n');
  return lines.flatMap((line, index) => {
    const runs: TextRun[] = [];
    if (index > 0) {
      runs.push(new TextRun({ ...options, break: 1 }));
    }
    if (line.length > 0 || lines.length === 1) {
      runs.push(new TextRun({ ...options, text: line }));
    }
    return runs;
  });
}

function headingFontSize(level: number): number {
  return Math.max(24, 34 - level * 2);
}

function unsupportedNodeError(nodeType: string, sceneId: string): Error {
  return new Error(`Unsupported Tiptap node "${nodeType}" in scene "${sceneId}".`);
}
