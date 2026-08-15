import { Injectable, inject } from '@angular/core';
import { ManuscriptStore } from '../../store/manuscript.store';
import { ParagraphVectorService } from '../../../../shared/services/paragraph-vector.service';
import { extractTextFromJsonNode } from '../content/manuscript-content.utils';
import type {
  DeleteParagraphsPayload,
  ParagraphDelete,
  ParagraphUpsert,
  UpsertParagraphsPayload,
} from '../../../../../../shared/models/vector.model';
import {
  hashParagraphVectorText,
  normalizeParagraphVectorText,
} from '../../../../../../shared/utils/paragraph-vector';

@Injectable({ providedIn: 'root' })
export class ManuscriptParagraphVectorSyncService {

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  private readonly store = inject(ManuscriptStore);
  private readonly paragraphVectorService = inject(ParagraphVectorService);


  // ---------------------------------------------------------------------------
  // Sync Queues
  // ---------------------------------------------------------------------------

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
    this.flattenParagraphNodes(previous).forEach(({ node }) => {
      const id = node['attrs']?.['id'] as string | undefined;
      if (id && this.isSyncableParagraphNode(node)) prevMap.set(id, node);
    });

    const newIds = new Set<string>();

    this.flattenParagraphNodes(newContent).forEach(({ node, position: index }) => {
      const paraId = node['attrs']?.['id'] as string | undefined;
      if (!paraId) return;

      if (!this.isParagraphNode(node)) return;

      const text = extractTextFromJsonNode(node);
      const normalizedText = normalizeParagraphVectorText(text);
      if (!this.hasSyncableText(normalizedText)) {
        this.pendingUpserts.delete(paraId);
        return;
      }

      newIds.add(paraId);

      const hash = hashParagraphVectorText(normalizedText);
      const prevNode = prevMap.get(paraId);
      const prevHash = prevNode
        ? hashParagraphVectorText(normalizeParagraphVectorText(extractTextFromJsonNode(prevNode)))
        : null;

      if (prevHash !== hash) {
        this.pendingUpserts.set(paraId, {
          paragraphId: paraId,
          sceneId,
          text: normalizedText,
          hash,
          position: index,
        });
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

  seedKnownParagraphs(sceneId: string, content: Record<string, any>[]): void {
    this.lastKnownParagraphs.set(sceneId, content);
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
        upserts.forEach(upsert => this.pendingUpserts.set(upsert.paragraphId, upsert));
        deletes.forEach(deletion => this.pendingParagraphDeletes.set(deletion.paragraphId, deletion));
        console.warn('[VectorSync] No bookId in store - skipping vector sync.');
        return;
      }

      const calls: Promise<void>[] = [];

      if (upserts.length > 0) {
        calls.push(
          this.paragraphVectorService.upsertParagraphs(
            { bookId, upserts } satisfies UpsertParagraphsPayload,
          )
        );
      }

      if (deletes.length > 0) {
        calls.push(
          this.paragraphVectorService.deleteParagraphs(
            { bookId, deletes } satisfies DeleteParagraphsPayload,
          )
        );
      }

      await Promise.all(calls);
      console.debug('[VectorSync] IPC call(s) completed successfully');
    } catch (error) {
      upserts.forEach(upsert => this.pendingUpserts.set(upsert.paragraphId, upsert));
      deletes.forEach(deletion => this.pendingParagraphDeletes.set(deletion.paragraphId, deletion));
      console.error('[VectorSync] Vector DB sync failed:', error);
    }
  }


  // ---------------------------------------------------------------------------
  // Paragraph Helpers
  // ---------------------------------------------------------------------------

  private isParagraphNode(node: Record<string, any>): boolean {
    return node['type'] === 'paragraph';
  }

  private isSyncableParagraphNode(node: Record<string, any>): boolean {
    return this.isParagraphNode(node)
      && this.hasSyncableText(normalizeParagraphVectorText(extractTextFromJsonNode(node)));
  }

  private hasSyncableText(text: string): boolean {
    return text.length > 0;
  }

  private flattenParagraphNodes(
    nodes: Record<string, any>[],
  ): Array<{ node: Record<string, any>; position: number }> {
    const paragraphs: Array<{ node: Record<string, any>; position: number }> = [];
    const visit = (node: Record<string, any>) => {
      if (this.isParagraphNode(node)) {
        paragraphs.push({ node, position: paragraphs.length });
      }
      const children = Array.isArray(node['content']) ? node['content'] : [];
      children.forEach(visit);
    };
    nodes.forEach(visit);
    return paragraphs;
  }

}
