import { ipcMain } from 'electron';

import type {
  SelectBookOpenRouterEmbeddingModelPayload,
} from '../../../shared/models/vector.model';
import { bookRepository } from '../../../db/repositories/book.repository';
import {
  OPENROUTER_EMBEDDING_MODELS,
  isOpenRouterEmbeddingModelName,
} from '../../../vectors/embeddings/openrouter-model-definition';
import { manuscriptVectorIndexService } from '../../../vectors/services/manuscript-vector-index.service';

/** Registers backend-only OpenRouter embedding configuration and selection handlers. */
export function setupOpenRouterEmbeddingModelHandlers(): void {
  ipcMain.handle(
    'vectors:openrouter:get-models',
    () => OPENROUTER_EMBEDDING_MODELS,
  );

  ipcMain.handle(
    'vectors:openrouter:get-book-selection',
    async (_event, payload: { bookId: string }) => {
      if (!payload || typeof payload.bookId !== 'string' || !payload.bookId.trim()) {
        throw new Error('Invalid OpenRouter book selection request.');
      }
      return {
        bookId: payload.bookId,
        modelName: await bookRepository.getOpenRouterEmbeddingModel(payload.bookId),
      };
    },
  );

  ipcMain.handle(
    'vectors:openrouter:select-for-book',
    async (event, payload: SelectBookOpenRouterEmbeddingModelPayload) => {
      if (
        !payload
        || typeof payload.bookId !== 'string'
        || !payload.bookId.trim()
        || typeof payload.modelName !== 'string'
        || !isOpenRouterEmbeddingModelName(payload.modelName)
        || typeof payload.reindex !== 'boolean'
      ) {
        throw new Error('Invalid OpenRouter embedding model selection request.');
      }

      return manuscriptVectorIndexService.selectOpenRouterModel(
        payload.bookId,
        payload.modelName,
        payload.reindex,
        (progress) => event.sender.send('vectors:openrouter:reindex-progress', progress),
      );
    },
  );
}
