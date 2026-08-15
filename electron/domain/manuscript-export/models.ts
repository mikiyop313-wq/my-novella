import type { ManuscriptMode, TiptapJsonDoc } from '../../../shared/models/manuscript.model';

export interface PrepareManuscriptExportRequest {
  mode: ManuscriptMode;
  id: string;
}

export interface ManuscriptExportTarget {
  mode: ManuscriptMode;
  id: string;
}

export interface ManuscriptExportBook {
  id: string;
  title: string;
  author: string;
  language: string;
}

interface ManuscriptExportStructureNode {
  id: string;
  number: number;
  title: string | null;
}

export interface ManuscriptExportAct extends ManuscriptExportStructureNode {
  type: 'act';
  chapters: ManuscriptExportChapter[];
}

export interface ManuscriptExportChapter extends ManuscriptExportStructureNode {
  type: 'chapter';
  scenes: ManuscriptExportScene[];
}

export interface ManuscriptExportScene extends ManuscriptExportStructureNode {
  type: 'scene';
  prose: TiptapJsonDoc;
}

export type ManuscriptExportNode =
  | ManuscriptExportAct
  | ManuscriptExportChapter
  | ManuscriptExportScene;

export interface ManuscriptExportDocument {
  target: ManuscriptExportTarget;
  book: ManuscriptExportBook;
  nodes: ManuscriptExportNode[];
}
