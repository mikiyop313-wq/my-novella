import { ipcMain } from 'electron';

import {
  VECTOR_CLOUD_PROVIDER_IDS,
  type SelectBookCloudEmbeddingProviderPayload,
} from '../../../shared/models/vector.model';
import { manuscriptVectorIndexService } from '../../../vectors/services/manuscript-vector-index.service';

/** Registers fixed-model cloud embedding provider selection handlers. */
export function setupCloudEmbeddingProviderHandlers(): void {
  ipcMain.handle(
    'vectors:cloud-provider:select-for-book',
    async (event, payload: SelectBookCloudEmbeddingProviderPayload) => {
      if (
        !payload
        || typeof payload.bookId !== 'string'
        || !payload.bookId.trim()
        || typeof payload.providerId !== 'string'
        || !VECTOR_CLOUD_PROVIDER_IDS.some(candidate => candidate === payload.providerId)
        || typeof payload.reindex !== 'boolean'
      ) {
        throw new Error('Invalid cloud embedding provider selection request.');
      }

      return manuscriptVectorIndexService.selectCloudProvider(
        payload.bookId,
        payload.providerId,
        payload.reindex,
        progress => event.sender.send('vectors:cloud-provider:reindex-progress', progress),
      );
    },
  );
}
