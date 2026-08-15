import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet, ChildrenOutletContexts } from '@angular/router';
import { filter } from 'rxjs';

import { WorkspaceSidebar } from './sidebar/workspace-sidebar';
import { WorkspaceBookStore } from './workspace-book.store';
import { WorkspaceStore } from './workspace.store';
import { ChatStore } from '../chat/store/chat.store';
import { routeAnimations } from '../../shared/animations/route-animations';

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
    if (this.router.url.includes('/outline')) {
      this.store.setActiveView('outline');
    } else if (
      this.router.url.includes('/threads') ||
      this.router.url.includes('/thread/') ||
      this.router.url.includes('/new-chat')
    ) {
      this.store.setActiveView('chat');
    } else {
      this.store.setActiveView('manuscript');
    }
  }
}
