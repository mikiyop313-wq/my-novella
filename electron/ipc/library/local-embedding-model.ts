
/**
 * Exposes local embedding model status, download, progress, and uninstall operations over IPC.
 *
 * @packageDocumentation
 */

import { ipcMain } from 'electron';

import type {
    DownloadLocalEmbeddingModelPayload,
    SelectBookLocalEmbeddingModelPayload,
    UninstallLocalEmbeddingModelPayload,
} from '../../../shared/models/vector.model';
import { bookRepository } from '../../../db/repositories/book.repository';
import { localEmbeddingModelManager } from '../../../vectors/embeddings/local-model-manager';
import { manuscriptVectorIndexService } from '../../../vectors/services/manuscript-vector-index.service';

/** Registers the local embedding model lifecycle handlers with Electron's main process. */
export function setupLocalEmbeddingModelHandlers(): void {
    ipcMain.handle(
        'vectors:local-model:get-status',
        () => localEmbeddingModelManager.getStatuses(),
    );

    ipcMain.handle('vectors:local-model:download', (event, payload: DownloadLocalEmbeddingModelPayload) => (
        localEmbeddingModelManager.download(payload, progress => {
            event.sender.send('vectors:local-model:download-progress', progress);
        })
    ));

    ipcMain.handle(
        'vectors:local-model:cancel-download',
        () => localEmbeddingModelManager.cancelActiveDownload(),
    );

    ipcMain.handle(
        'vectors:local-model:uninstall',
        (_, payload: UninstallLocalEmbeddingModelPayload) => (
            localEmbeddingModelManager.uninstall(payload)
        ),
    );

    ipcMain.handle(
        'vectors:local-model:get-book-selection',
        async (_, payload: { bookId: string }) => ({
            bookId: payload.bookId,
            modelName: await bookRepository.getLocalEmbeddingModel(payload.bookId),
        }),
    );

    ipcMain.handle(
        'vectors:local-model:select-for-book',
        async (event, payload: SelectBookLocalEmbeddingModelPayload) => {
            const status = await localEmbeddingModelManager.getStatus(payload.modelName);
            if (!status.installed) {
                throw new Error(`${status.displayName} must be installed before selecting it.`);
            }

            return manuscriptVectorIndexService.selectLocalModel(
                payload.bookId,
                payload.modelName,
                payload.reindex,
                progress => event.sender.send('vectors:local-model:reindex-progress', progress),
            );
        },
    );
}
