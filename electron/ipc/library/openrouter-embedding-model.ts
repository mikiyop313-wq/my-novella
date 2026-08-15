import { ipcMain } from 'electron';

import type {
  SaveOpenRouterVectorApiKeyRequest,
  SelectBookOpenRouterEmbeddingModelPayload,
} from '../../../shared/models/vector.model';
import { bookRepository } from '../../../db/repositories/book.repository';
import { testOpenRouterConnection } from '../../domain/vector/openrouter-connection';
import { vectorApiKeyService } from '../../domain/vector/vector-api-key.service';
import {
  OPENROUTER_EMBEDDING_MODELS,
  isOpenRouterEmbeddingModelName,
} from '../../../vectors/embeddings/openrouter-model-definition';
import { manuscriptVectorIndexService } from '../../../vectors/services/manuscript-vector-index.service';

/** Registers backend-only OpenRouter embedding configuration and selection handlers. */
export function setupOpenRouterEmbeddingModelHandlers(): void {
  ipcMain.handle(
    'vectors:openrouter:get-api-key-status',
    () => vectorApiKeyService.getApiKeyStatus('openrouter'),
  );

  ipcMain.handle(
    'vectors:openrouter:load-api-key',
    () => vectorApiKeyService.getApiKey('openrouter'),
  );

  ipcMain.handle(
    'vectors:openrouter:save-api-key',
    (_event, payload: SaveOpenRouterVectorApiKeyRequest) => {
      if (!payload || typeof payload.apiKey !== 'string') {
        throw new Error('Invalid OpenRouter vector API key request.');
      }
      return vectorApiKeyService.saveApiKey('openrouter', payload.apiKey);
    },
  );

  ipcMain.handle(
    'vectors:openrouter:test-connection',
    () => testOpenRouterConnection(),
  );

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
