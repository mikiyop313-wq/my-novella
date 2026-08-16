import { Component, DestroyRef, OnInit, ViewChild, computed, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet, ChildrenOutletContexts } from '@angular/router';
import { filter } from 'rxjs';

import { WorkspaceSidebar } from './sidebar/workspace-sidebar';
import { WorkspaceBookStore } from './workspace-book.store';
import { WorkspaceStore } from './workspace.store';
import { ChatStore } from '../chat/store/chat.store';
import { routeAnimations } from '../../shared/animations/route-animations';
import { CodexContextTrieService } from '../codex/services/codex-context-trie.service';
import { ManuscriptMode } from '../../../../shared/models/manuscript.model';
import type { CodexEntryDto, DetectedCodexEntryDto } from '../../../../shared/models/codex.model';
import {
  CodexDetectionModalComponent,
  type CodexDetectionSaveResult,
} from '../codex/components/codex-detection-modal/codex-detection-modal.component';
import { CodexService } from '../codex/services/codex.service';
import {
  CodexDetectionStateService,
  type PendingCodexDetection,
} from '../codex/services/codex-detection-state.service';
import { CodexStore } from '../codex/store/codex.store';
import { OverlayModalDirective } from '../../shared/directives/overlay-modal.directive';
import { ToastService } from '../../shared/services/toast.service';
import { filterNewCodexEntries } from '../codex/utils/codex-detection-response';
import { ParagraphReviewModalComponent } from '../manuscript/components/paragraph-review-modal/paragraph-review-modal.component';
import { ParagraphReviewService } from '../manuscript/helpers/ai/paragraph-review.service';

@Component({
  selector: 'app-workspace',
  imports: [
    RouterOutlet,
    RouterLink,
    WorkspaceSidebar,
    CodexDetectionModalComponent,
    ParagraphReviewModalComponent,
    OverlayModalDirective,
  ],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
  animations: [routeAnimations]
})
export class Workspace implements OnInit {
  readonly store = inject(WorkspaceStore);
  readonly bookStore = inject(WorkspaceBookStore);
  readonly chatStore = inject(ChatStore);
  readonly codexContextTrie = inject(CodexContextTrieService);
  readonly codexDetectionState = inject(CodexDetectionStateService);
  readonly paragraphReview = inject(ParagraphReviewService);

  readonly activeCodexDetection = computed(() => (
    this.codexDetectionState.activeDetection(this.store.bookId())
  ));
  readonly detectedCodexEntries = computed(() => this.activeCodexDetection()?.entries ?? []);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly contexts = inject(ChildrenOutletContexts);
  private readonly codexService = inject(CodexService);
  private readonly codexStore = inject(CodexStore);
  private readonly toastService = inject(ToastService);
  private pendingCodexModalTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingParagraphReviewModalTimer: ReturnType<typeof setTimeout> | null = null;
  private displayedCodexDetection: PendingCodexDetection | null = null;
  private readonly processingDetectionQueues = new Set<string>();

  @ViewChild('codexDetectionModalTrigger')
  private codexDetectionModalTrigger?: OverlayModalDirective;

  @ViewChild('paragraphReviewModalTrigger')
  private paragraphReviewModalTrigger?: OverlayModalDirective;

  constructor() {
    effect(() => {
      if (this.detectedCodexEntries().length === 0) return;

      if (this.pendingCodexModalTimer !== null) clearTimeout(this.pendingCodexModalTimer);
      this.pendingCodexModalTimer = setTimeout(() => {
        this.pendingCodexModalTimer = null;
        this.displayedCodexDetection = this.activeCodexDetection();
        this.codexDetectionModalTrigger?.openModal();
      });
    });

    effect(() => {
      if (!this.paragraphReview.activeReview()) return;

      if (this.pendingParagraphReviewModalTimer !== null) {
        clearTimeout(this.pendingParagraphReviewModalTimer);
      }
      this.pendingParagraphReviewModalTimer = setTimeout(() => {
        this.pendingParagraphReviewModalTimer = null;
        this.paragraphReviewModalTrigger?.openModal();
      });
    });

    this.destroyRef.onDestroy(() => {
      if (this.pendingCodexModalTimer !== null) clearTimeout(this.pendingCodexModalTimer);
      if (this.pendingParagraphReviewModalTimer !== null) {
        clearTimeout(this.pendingParagraphReviewModalTimer);
      }
      this.paragraphReview.complete();
    });
  }

  readonly saveDetectedCodexEntry = async (
    entry: DetectedCodexEntryDto,
  ): Promise<CodexDetectionSaveResult> => {
    const bookId = this.displayedCodexDetection?.bookId
      ?? this.activeCodexDetection()?.bookId
      ?? null;
    if (!bookId) {
      return { success: false, error: 'Failed to add the Codex entry.' };
    }

    try {
      await this.codexService.createEntry({
        bookId,
        type: entry.type,
        name: entry.name,
        description: entry.description,
        trackingSetting: 'include_when_detected',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add the Codex entry.';
      return { success: false, error: message };
    }

    await this.codexStore.loadEntries(
      bookId,
      this.codexStore.activeType(),
      this.codexStore.searchQuery().trim(),
      this.codexStore.entryFilters(),
    );
    try {
      await this.codexContextTrie.refreshCurrentContext();
    } catch (error) {
      console.error('Failed to refresh Codex context after detection:', error);
    }
    return { success: true };
  };

  onCodexDetectionModalClosed(): void {
    const closedDetection = this.displayedCodexDetection;
    this.displayedCodexDetection = null;
    if (!closedDetection || !this.codexDetectionState.completeActive(closedDetection)) return;

    void this.processNextCodexDetection(closedDetection.bookId);
  }

  onParagraphReviewModalClosed(): void {
    this.paragraphReview.complete();
  }

  ngOnInit(): void {
    this.syncActiveViewFromUrl();

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.syncActiveViewFromUrl());

    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const bookId = params.get('bookId');
        if (!bookId) return;

        this.store.enterBook(bookId);
        this.bookStore.clearBookHierarchy();
        void this.bookStore.loadBookHierarchy('book', bookId).catch(error => {
          console.error('Failed to load shared book hierarchy', error);
        });
        void this.codexContextTrie.loadForContext(bookId);
        void this.processNextCodexDetection(bookId);
        this.navigateToDefaultOutline(bookId);
      });
  }

  getRouteAnimationData() {
    return this.contexts.getContext('primary')?.route?.snapshot?.data?.['animation'];
  }

  getChatRoute(bookId: string): string[] {
    const selectedThread = this.chatStore.selectedThread();

    if (this.chatStore.bookId() === bookId && selectedThread) {
      return ['/workspace', bookId, 'thread', selectedThread.id];
    }

    return ['/workspace', bookId, 'threads'];
  }

  getManuscriptRoute(bookId: string): string[] {
    const route = this.store.getLastManuscriptRoute(bookId);

    return ['/workspace', bookId, 'manuscript', route?.mode ?? 'book', route?.id ?? bookId];
  }

  private navigateToDefaultOutline(bookId: string): void {
    const workspaceUrl = `/workspace/${bookId}`;
    const currentUrl = this.router.url.replace(/\/$/, '');

    if (currentUrl !== workspaceUrl) return;

    this.router.navigate(['outline'], {
      relativeTo: this.route,
      replaceUrl: true,
    });
  }

  private syncActiveViewFromUrl(): void {
    const workspaceUrl = this.router.url;
    this.rememberManuscriptRouteFromUrl();

    if (workspaceUrl.includes('/settings')) {
      this.store.setActiveView('settings');
    } else if (workspaceUrl.includes('/outline')) {
      this.store.setActiveView('outline');
      this.store.setLastWorkspaceUrl(workspaceUrl);
    } else if (
      workspaceUrl.includes('/threads') ||
      workspaceUrl.includes('/thread/') ||
      workspaceUrl.includes('/new-chat')
    ) {
      this.store.setActiveView('chat');
      this.store.setLastWorkspaceUrl(workspaceUrl);
    } else {
      this.store.setActiveView('manuscript');
      if (workspaceUrl.includes('/manuscript/')) {
        this.store.setLastWorkspaceUrl(workspaceUrl);
      }
    }
  }

  private async processNextCodexDetection(bookId: string): Promise<void> {
    if (
      this.processingDetectionQueues.has(bookId)
      || this.codexDetectionState.activeDetection(bookId)
    ) return;

    this.processingDetectionQueues.add(bookId);
    try {
      await this.prepareNextCodexDetection(bookId);
    } finally {
      this.processingDetectionQueues.delete(bookId);
    }
  }

  private async prepareNextCodexDetection(bookId: string): Promise<void> {
    const detection = this.codexDetectionState.nextQueued(bookId);
    if (!detection) return;

    let existingEntries: CodexEntryDto[];
    try {
      existingEntries = await this.codexService.getEntries(bookId, { includeArchived: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh Codex entries.';
      this.showCodexDetectionRetry(message, bookId);
      return;
    }

    const entries = filterNewCodexEntries({
      detectedEntries: detection.entries,
      existingEntries,
    });
    if (entries.length > 0) {
      this.codexDetectionState.activateQueued(detection, entries);
      return;
    }

    if (!this.codexDetectionState.discardQueued(detection)) return;

    this.toastService.info('No new Codex entries were detected.', 'Codex Detection');
    await this.prepareNextCodexDetection(bookId);
  }

  private showCodexDetectionRetry(message: string, bookId: string): void {
    this.toastService.show({
      type: 'error',
      title: 'Codex Detection',
      message: `Could not refresh the Codex: ${message}`,
      timeout: 0,
      action: {
        label: 'Retry',
        handler: () => this.processNextCodexDetection(bookId),
      },
    });
  }

  private rememberManuscriptRouteFromUrl(): void {
    const match = this.router.url.match(/^\/workspace\/([^/?#]+)\/manuscript\/(book|act|chapter|scene)\/([^/?#]+)/);
    if (!match) return;

    const [, bookId, mode, id] = match;
    this.store.rememberManuscriptRoute(bookId, { mode: mode as ManuscriptMode, id });
  }
}
