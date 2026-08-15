import { Injectable, inject } from '@angular/core';

import type {
  DeleteParagraphsPayload,
  SearchSimilarParagraphsPayload,
  SimilarParagraphResult,
  UpsertParagraphsPayload,
} from '../../../../shared/models/vector.model';
import { ElectronService } from '../../core/services/electron.service';

@Injectable({ providedIn: 'root' })
export class ParagraphVectorService {
  private readonly electronService = inject(ElectronService);

  searchSimilarParagraphs(
    payload: SearchSimilarParagraphsPayload,
  ): Promise<SimilarParagraphResult[]> {
    return this.electronService.invoke('vectors:searchSimilar', payload);
  }

  upsertParagraphs(payload: UpsertParagraphsPayload): Promise<void> {
    return this.electronService.invoke('vectors:upsertParagraphs', payload);
  }

  deleteParagraphs(payload: DeleteParagraphsPayload): Promise<void> {
    return this.electronService.invoke('vectors:deleteParagraphs', payload);
  }
}
