import { Injectable, NgZone, OnDestroy, inject, signal } from '@angular/core';
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

export type ManuscriptIndexingState = 'updated' | 'pending' | 'indexing' | 'error';

interface SyncedParagraph {
  hash: string;
}

const AI_GENERATED_BLOCK_NODE_TYPE = 'aiGeneratedBlock';

@Injectable({ providedIn: 'root' })
export class ManuscriptParagraphVectorSyncService implements OnDestroy {

  private static readonly AUTOMATIC_FLUSH_DELAY_MS = 10_000;

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  private readonly store = inject(ManuscriptStore);
  private readonly paragraphVectorService = inject(ParagraphVectorService);
  private readonly ngZone = inject(NgZone);


  // ---------------------------------------------------------------------------
  // Sync Queues
  // ---------------------------------------------------------------------------

  private pendingUpserts = new Map<string, ParagraphUpsert>();
  private pendingParagraphDeletes = new Map<string, ParagraphDelete>();
  private lastKnownParagraphs = new Map<string, Record<string, any>[]>();
  private syncedParagraphs = new Map<string, Map<string, SyncedParagraph>>();
  private activeBookId: string | null = null;
  private configurationLoaded = false;
  private automaticFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private activeFlush: Promise<void> | null = null;

  private readonly indexingStateSignal = signal<ManuscriptIndexingState>('updated');
  private readonly indexingAvailableSignal = signal(false);
  private readonly automaticIndexingEnabledSignal = signal(true);

  readonly indexingState = this.indexingStateSignal.asReadonly();
  readonly indexingAvailable = this.indexingAvailableSignal.asReadonly();
  readonly automaticIndexingEnabled = this.automaticIndexingEnabledSignal.asReadonly();

  ngOnDestroy(): void {
    this.cancelAutomaticFlush();
  }

  /**
   * Diffs the new paragraph list for a scene against the last-known snapshot.
   * Changed/new paragraphs are queued for upsert; disappeared paragraphs are
   * queued for deletion. Undo/redo cancels the opposite pending entry.
   */
  snapshotDirtyParagraphs(sceneId: string, newContent: Record<string, any>[]): void {
    this.lastKnownParagraphs.set(sceneId, newContent);
    this.rebuildPendingForScene(sceneId);
    this.refreshIdleState();
    this.scheduleAutomaticFlush();
  }

  seedKnownParagraphs(sceneId: string, content: Record<string, any>[]): void {
    this.lastKnownParagraphs.set(sceneId, content);
    this.syncedParagraphs.set(sceneId, this.toSyncedParagraphMap(content));
    this.removePendingForScene(sceneId);
    this.refreshIdleState();
    this.scheduleAutomaticFlush();
  }

  async refreshIndexingConfiguration(bookId: string): Promise<void> {
    this.cancelAutomaticFlush();
    this.activeBookId = bookId;
    this.configurationLoaded = false;
    this.runInAngularZone(() => this.indexingAvailableSignal.set(false));

    const configuration = await this.paragraphVectorService.getBookIndexingConfiguration(bookId);
    if (this.activeBookId !== bookId) return;

    this.runInAngularZone(() => {
      this.configurationLoaded = true;
      this.indexingAvailableSignal.set(configuration.available);
      this.automaticIndexingEnabledSignal.set(configuration.automaticIndexingEnabled);
    });
    this.scheduleAutomaticFlush();
  }

  retryParagraphVectorChanges(): Promise<void> {
    return this.flushParagraphVectorChanges();
  }

  /**
   * Drains pending upsert/delete queues and sends them to the main process for
   * vector DB sync. No-ops silently when there are no changes.
   */
  async flushParagraphVectorChanges(): Promise<void> {
    if (this.activeFlush) return this.activeFlush;

    const flush = this.flushPendingParagraphVectorChanges();
    this.activeFlush = flush;

    try {
      await flush;
    } finally {
      if (this.activeFlush === flush) this.activeFlush = null;
    }
  }

  private async flushPendingParagraphVectorChanges(): Promise<void> {
    this.cancelAutomaticFlush();
    const upserts = [...this.pendingUpserts.values()];
    const deletes = [...this.pendingParagraphDeletes.values()];
    this.pendingUpserts.clear();
    this.pendingParagraphDeletes.clear();

    if (!upserts.length && !deletes.length) {
      this.refreshIdleState();
      return;
    }

    this.setIndexingState('indexing');

    console.debug(
      `[VectorSync] Flushing - ${upserts.length} upsert(s), ${deletes.length} delete(s)`,
      {
        upserts: upserts.map(u => ({ id: u.paragraphId, scene: u.sceneId, chars: u.text.length })),
        deletes: deletes.map(d => ({ id: d.paragraphId, scene: d.sceneId })),
      }
    );

    try {
      const bookId = this.activeBookId ?? this.store.bookId();
      if (!bookId) {
        upserts.forEach(upsert => this.pendingUpserts.set(upsert.paragraphId, upsert));
        deletes.forEach(deletion => this.pendingParagraphDeletes.set(deletion.paragraphId, deletion));
        this.setIndexingState('error');
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
      const affectedSceneIds = new Set([
        ...this.getPendingSceneIds(),
        ...upserts.map(upsert => upsert.sceneId),
        ...deletes.map(deletion => deletion.sceneId),
      ]);
      this.applySuccessfulBatch(upserts, deletes);
      this.rebuildPendingForScenes(affectedSceneIds);
      this.setIndexingState('updated');
      this.refreshIdleState();
      this.scheduleAutomaticFlush();
      console.debug('[VectorSync] IPC call(s) completed successfully');
    } catch (error) {
      this.rebuildPendingForScenes(new Set([
        ...this.getPendingSceneIds(),
        ...upserts.map(upsert => upsert.sceneId),
        ...deletes.map(deletion => deletion.sceneId),
      ]));
      this.setIndexingState('error');
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

  private getPendingSceneIds(): Set<string> {
    const sceneIds = new Set<string>();
    this.pendingUpserts.forEach(upsert => sceneIds.add(upsert.sceneId));
    this.pendingParagraphDeletes.forEach(deletion => sceneIds.add(deletion.sceneId));
    return sceneIds;
  }

  private rebuildPendingForScenes(sceneIds: Set<string>): void {
    sceneIds.forEach(sceneId => this.rebuildPendingForScene(sceneId));
  }

  private rebuildPendingForScene(sceneId: string): void {
    this.removePendingForScene(sceneId);

    const synced = this.syncedParagraphs.get(sceneId) ?? new Map<string, SyncedParagraph>();
    const currentIds = new Set<string>();
    const current = this.lastKnownParagraphs.get(sceneId) ?? [];

    this.flattenParagraphNodes(current).forEach(({ node, position }) => {
      const paragraphId = node['attrs']?.['id'] as string | undefined;
      if (!paragraphId || !this.isSyncableParagraphNode(node)) return;

      const text = normalizeParagraphVectorText(extractTextFromJsonNode(node));
      const hash = hashParagraphVectorText(text);
      currentIds.add(paragraphId);

      if (synced.get(paragraphId)?.hash !== hash) {
        this.pendingUpserts.set(paragraphId, {
          paragraphId,
          sceneId,
          text,
          hash,
          position,
        });
      }
    });

    synced.forEach((_, paragraphId) => {
      if (!currentIds.has(paragraphId)) {
        this.pendingParagraphDeletes.set(paragraphId, { paragraphId, sceneId });
      }
    });
  }

  private removePendingForScene(sceneId: string): void {
    this.pendingUpserts.forEach((upsert, paragraphId) => {
      if (upsert.sceneId === sceneId) this.pendingUpserts.delete(paragraphId);
    });
    this.pendingParagraphDeletes.forEach((deletion, paragraphId) => {
      if (deletion.sceneId === sceneId) this.pendingParagraphDeletes.delete(paragraphId);
    });
  }

  private toSyncedParagraphMap(content: Record<string, any>[]): Map<string, SyncedParagraph> {
    const synced = new Map<string, SyncedParagraph>();
    this.flattenParagraphNodes(content).forEach(({ node }) => {
      const paragraphId = node['attrs']?.['id'] as string | undefined;
      if (!paragraphId || !this.isSyncableParagraphNode(node)) return;
      const text = normalizeParagraphVectorText(extractTextFromJsonNode(node));
      synced.set(paragraphId, { hash: hashParagraphVectorText(text) });
    });
    return synced;
  }

  private applySuccessfulBatch(
    upserts: ParagraphUpsert[],
    deletes: ParagraphDelete[],
  ): void {
    upserts.forEach(upsert => {
      const synced = this.syncedParagraphs.get(upsert.sceneId) ?? new Map<string, SyncedParagraph>();
      synced.set(upsert.paragraphId, { hash: upsert.hash });
      this.syncedParagraphs.set(upsert.sceneId, synced);
    });
    deletes.forEach(deletion => {
      this.syncedParagraphs.get(deletion.sceneId)?.delete(deletion.paragraphId);
    });
  }

  private refreshIdleState(): void {
    if (this.indexingStateSignal() === 'indexing') return;
    const hasPending = this.pendingUpserts.size > 0 || this.pendingParagraphDeletes.size > 0;
    if (this.indexingStateSignal() === 'error' && hasPending) return;
    this.setIndexingState(hasPending ? 'pending' : 'updated');
  }

  private scheduleAutomaticFlush(): void {
    this.cancelAutomaticFlush();

    const hasPending = this.pendingUpserts.size > 0 || this.pendingParagraphDeletes.size > 0;
    if (
      !this.configurationLoaded
      || !this.indexingAvailableSignal()
      || !this.automaticIndexingEnabledSignal()
      || !hasPending
      || this.indexingStateSignal() === 'error'
    ) return;

    this.automaticFlushTimer = setTimeout(() => {
      this.automaticFlushTimer = null;
      void this.flushParagraphVectorChanges();
    }, ManuscriptParagraphVectorSyncService.AUTOMATIC_FLUSH_DELAY_MS);
  }

  private cancelAutomaticFlush(): void {
    if (this.automaticFlushTimer === null) return;
    clearTimeout(this.automaticFlushTimer);
    this.automaticFlushTimer = null;
  }

  private setIndexingState(state: ManuscriptIndexingState): void {
    this.runInAngularZone(() => this.indexingStateSignal.set(state));
  }

  private runInAngularZone(update: () => void): void {
    if (NgZone.isInAngularZone()) {
      update();
      return;
    }

    this.ngZone.run(update);
  }

  private flattenParagraphNodes(
    nodes: Record<string, any>[],
  ): Array<{ node: Record<string, any>; position: number }> {
    const paragraphs: Array<{ node: Record<string, any>; position: number }> = [];
    const visit = (node: Record<string, any>) => {
      if (node['type'] === AI_GENERATED_BLOCK_NODE_TYPE) return;

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
