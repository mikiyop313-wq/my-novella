import { Injectable, inject } from '@angular/core';
import { ManuscriptStore } from '../../store/manuscript.store';
import { ElectronService } from '../../../../core/services/electron.service';
import { extractTextFromJsonNode } from '../content/manuscript-content.utils';
import type {
  DeleteParagraphsPayload,
  ParagraphDelete,
  ParagraphUpsert,
  UpsertParagraphsPayload,
} from '../../../../../../shared/models/vector.model';

@Injectable({ providedIn: 'root' })
export class ManuscriptParagraphVectorSyncService {
  private readonly store = inject(ManuscriptStore);
  private readonly electronService = inject(ElectronService);

  private pendingUpserts = new Map<string, ParagraphUpsert>();
  private pendingParagraphDeletes = new Map<string, ParagraphDelete>();
  private lastKnownParagraphs = new Map<string, Record<string, any>[]>();

  /**
   * Diffs the new paragraph list for a scene against the last-known snapshot.
   * Changed/new paragraphs are queued for upsert; disappeared paragraphs are
   * queued for deletion. Undo/redo cancels the opposite pending entry.
   */
  snapshotDirtyParagraphs(sceneId: string, newContent: Record<string, any>[]): void {
    const previous = this.lastKnownParagraphs.get(sceneId) ?? [];
    const prevMap = new Map<string, Record<string, any>>();
    previous.forEach(node => {
      const id = node['attrs']?.['id'] as string | undefined;
      if (id) prevMap.set(id, node);
    });

    const newIds = new Set<string>();

    newContent.forEach((node, index) => {
      const paraId = node['attrs']?.['id'] as string | undefined;
      if (!paraId) return;
      newIds.add(paraId);

      const text = extractTextFromJsonNode(node);
      const hash = this.simpleHash(text);
      const prevNode = prevMap.get(paraId);
      const prevHash = prevNode
        ? this.simpleHash(extractTextFromJsonNode(prevNode))
        : null;

      if (prevHash !== hash) {
        this.pendingUpserts.set(paraId, { paragraphId: paraId, sceneId, text, hash, position: index });
        this.pendingParagraphDeletes.delete(paraId);
      }
    });

    prevMap.forEach((_, paraId) => {
      if (!newIds.has(paraId)) {
        this.pendingParagraphDeletes.set(paraId, { paragraphId: paraId, sceneId });
        this.pendingUpserts.delete(paraId);
      }
    });

    this.lastKnownParagraphs.set(sceneId, newContent);
  }

  /**
   * Drains pending upsert/delete queues and sends them to the main process for
   * vector DB sync. No-ops silently when there are no changes.
   */
  async flushParagraphVectorChanges(): Promise<void> {
    const upserts = [...this.pendingUpserts.values()];
    const deletes = [...this.pendingParagraphDeletes.values()];
    this.pendingUpserts.clear();
    this.pendingParagraphDeletes.clear();

    if (!upserts.length && !deletes.length) return;

    console.debug(
      `[VectorSync] Flushing - ${upserts.length} upsert(s), ${deletes.length} delete(s)`,
      {
        upserts: upserts.map(u => ({ id: u.paragraphId, scene: u.sceneId, chars: u.text.length })),
        deletes: deletes.map(d => ({ id: d.paragraphId, scene: d.sceneId })),
      }
    );

    try {
      const bookId = this.store.bookId();
      if (!bookId) {
        console.warn('[VectorSync] No bookId in store - skipping vector sync.');
        return;
      }

      const calls: Promise<void>[] = [];

      if (upserts.length > 0) {
        calls.push(
          this.electronService.invoke('vectors:upsertParagraphs', { bookId, upserts } satisfies UpsertParagraphsPayload)
        );
      }

      if (deletes.length > 0) {
        calls.push(
          this.electronService.invoke('vectors:deleteParagraphs', { deletes } satisfies DeleteParagraphsPayload)
        );
      }

      await Promise.all(calls);
      console.debug('[VectorSync] IPC call(s) completed successfully');
    } catch (error) {
      console.error('[VectorSync] Vector DB sync failed:', error);
    }
  }

  /**
   * Lightweight djb2 string hash, fast enough for per-keystroke diffing.
   * Collisions are extremely unlikely for paragraph-length strings.
   */
  private simpleHash(text: string): string {
    let h = 5381;
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) + h) ^ text.charCodeAt(i);
    }
    return (h >>> 0).toString(36);
  }
}
