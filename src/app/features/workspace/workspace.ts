import { Component, DestroyRef, OnInit, inject } from '@angular/core';
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

@Component({
  selector: 'app-workspace',
  imports: [RouterOutlet, RouterLink, WorkspaceSidebar],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
  animations: [routeAnimations]
})
export class Workspace implements OnInit {
  readonly store = inject(WorkspaceStore);
  readonly bookStore = inject(WorkspaceBookStore);
  readonly chatStore = inject(ChatStore);
  readonly codexContextTrie = inject(CodexContextTrieService);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly contexts = inject(ChildrenOutletContexts);

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
        void this.codexContextTrie.loadForContext(bookId);
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

  private rememberManuscriptRouteFromUrl(): void {
    const match = this.router.url.match(/^\/workspace\/([^/?#]+)\/manuscript\/(book|act|chapter|scene)\/([^/?#]+)/);
    if (!match) return;

    const [, bookId, mode, id] = match;
    this.store.rememberManuscriptRoute(bookId, { mode: mode as ManuscriptMode, id });
  }
}
