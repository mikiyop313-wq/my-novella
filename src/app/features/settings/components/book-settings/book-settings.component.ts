import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';

import { WorkspaceStore } from '../../../workspace/workspace.store';

@Component({
  selector: 'app-book-settings',
  templateUrl: './book-settings.component.html',
  styleUrl: '../../styles/settings.shared.scss',
  host: { class: 'book-settings-panel' },
})
export class BookSettingsComponent implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly workspaceStore = inject(WorkspaceStore);

  @ViewChild('backButton')
  private backButton?: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    this.backButton?.nativeElement.focus();
  }

  closeSettings(): void {
    const bookId = this.workspaceStore.bookId();
    if (!bookId) {
      void this.router.navigateByUrl('/library');
      return;
    }

    const workspacePrefix = `/workspace/${bookId}/`;
    const lastWorkspaceUrl = this.workspaceStore.lastWorkspaceUrl();
    const returnUrl =
      lastWorkspaceUrl?.startsWith(workspacePrefix) &&
      !lastWorkspaceUrl.includes('/settings')
        ? lastWorkspaceUrl
        : `${workspacePrefix}outline`;

    void this.router.navigateByUrl(returnUrl);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    event.preventDefault();
    this.closeSettings();
  }
}
