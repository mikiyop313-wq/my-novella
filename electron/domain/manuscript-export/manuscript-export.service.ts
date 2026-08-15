import type { BookRepository } from '../../../db/repositories/book.repository';
import { bookRepository } from '../../../db/repositories/book.repository';
import type { ManuscriptRepository } from '../../../db/repositories/manuscript.repository';
import { manuscriptRepository } from '../../../db/repositories/manuscript.repository';
import type {
  ActDto,
  ChapterDto,
  ManuscriptDataDto,
  ManuscriptMode,
  SceneDto,
} from '../../../shared/models/manuscript.model';
import type {
  ManuscriptExportAct,
  ManuscriptExportChapter,
  ManuscriptExportDocument,
  ManuscriptExportNode,
  ManuscriptExportScene,
  PrepareManuscriptExportRequest,
} from './models';

interface ManuscriptExportServiceDependencies {
  manuscriptRepository: Pick<ManuscriptRepository, 'getBookIdForTarget' | 'getManuscript'>;
  bookRepository: Pick<BookRepository, 'getById'>;
}

/** Prepares readable manuscript data for the concrete format exporters. */
export class ManuscriptExportService {
  private readonly manuscripts: ManuscriptExportServiceDependencies['manuscriptRepository'];
  private readonly books: ManuscriptExportServiceDependencies['bookRepository'];

  constructor({
    manuscriptRepository: manuscripts = manuscriptRepository,
    bookRepository: books = bookRepository,
  }: Partial<ManuscriptExportServiceDependencies> = {}) {
    this.manuscripts = manuscripts;
    this.books = books;
  }

  async prepareExport({
    mode,
    id,
  }: PrepareManuscriptExportRequest): Promise<ManuscriptExportDocument> {
    const bookId = await this.manuscripts.getBookIdForTarget(mode, id);
    if (!bookId) {
      throw this.targetNotFoundError(mode, id);
    }

    const [book, manuscript] = await Promise.all([
      this.books.getById(bookId),
      this.manuscripts.getManuscript(mode, id),
    ]);

    if (!book || !this.isAvailableTarget(mode, manuscript)) {
      throw this.targetNotFoundError(mode, id);
    }

    return {
      target: { mode, id },
      book: {
        id: book.id,
        title: book.title,
        author: book.author,
      },
      nodes: this.buildExportNodes(mode, manuscript),
    };
  }

  private isAvailableTarget(
    mode: ManuscriptMode,
    manuscript: ManuscriptDataDto | undefined,
  ): manuscript is ManuscriptDataDto {
    if (mode === 'book') {
      return Array.isArray(manuscript);
    }

    return manuscript !== undefined && !Array.isArray(manuscript);
  }

  private buildExportNodes(
    mode: ManuscriptMode,
    manuscript: ManuscriptDataDto,
  ): ManuscriptExportNode[] {
    switch (mode) {
      case 'book':
        return (manuscript as ActDto[]).map((act) => this.mapAct(act));
      case 'act':
        return [this.mapAct(manuscript as ActDto)];
      case 'chapter':
        return [this.mapChapter(manuscript as ChapterDto)];
      case 'scene':
        return [this.mapScene(manuscript as SceneDto)];
    }
  }

  private mapAct(act: ActDto): ManuscriptExportAct {
    return {
      type: 'act',
      id: act.id,
      number: act.position + 1,
      title: this.normalizeTitle(act.title),
      chapters: (act.chapters ?? []).map((chapter) => this.mapChapter(chapter)),
    };
  }

  private mapChapter(chapter: ChapterDto): ManuscriptExportChapter {
    return {
      type: 'chapter',
      id: chapter.id,
      number: chapter.position + 1,
      title: this.normalizeTitle(chapter.title),
      scenes: (chapter.scenes ?? []).map((scene) => this.mapScene(scene)),
    };
  }

  private mapScene(scene: SceneDto): ManuscriptExportScene {
    return {
      type: 'scene',
      id: scene.id,
      number: scene.position + 1,
      title: this.normalizeTitle(scene.title),
      prose: scene.prose ?? { type: 'doc', content: [] },
    };
  }

  private normalizeTitle(title: string): string | null {
    return title.trim() ? title : null;
  }

  private targetNotFoundError(mode: ManuscriptMode, id: string): Error {
    return new Error(`Manuscript export target not found or unavailable: ${mode} "${id}".`);
  }
}

export const manuscriptExportService = new ManuscriptExportService();
