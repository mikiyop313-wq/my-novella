
/**
 * Exposes local embedding model status, download, progress, and uninstall operations over IPC.
 *
 * @packageDocumentation
 */

import { ipcMain } from 'electron';

import type {
    DownloadLocalEmbeddingModelPayload,
    UninstallLocalEmbeddingModelPayload,
} from '../../../shared/models/vector.model';
import { localEmbeddingModelManager } from '../../../vectors/embeddings/local-model-manager';

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
        'vectors:local-model:uninstall',
        (_, payload: UninstallLocalEmbeddingModelPayload) => (
            localEmbeddingModelManager.uninstall(payload)
        ),
    );
}
