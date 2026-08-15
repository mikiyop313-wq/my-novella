import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { filter } from 'rxjs';

import { CodexContextTrieService } from '../services/codex-context-trie.service';
import { CodexEntryOpenerService } from '../services/codex-entry-opener.service';
import {
  CodexMatchChooserComponent,
  type CodexMatchChooserEntry,
} from './codex-match-chooser.component';

@Injectable({ providedIn: 'root' })
export class CodexMatchChooserService {
  private readonly overlay = inject(Overlay);
  private readonly codexContextTrie = inject(CodexContextTrieService);
  private readonly codexEntryOpener = inject(CodexEntryOpenerService);
  private overlayRef: OverlayRef | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.close());
  }

  open(entryIds: readonly string[], x: number, y: number): void {
    this.close();

    const entries = this.resolveEntries(entryIds);
    if (entries.length === 0) return;

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo({ x, y })
      .withFlexibleDimensions(false)
      .withPush(true)
      .withPositions([
        {
          originX: 'start',
          originY: 'bottom',
          overlayX: 'start',
          overlayY: 'top',
          offsetX: 4,
          offsetY: 16,
        },
        {
          originX: 'end',
          originY: 'bottom',
          overlayX: 'end',
          overlayY: 'top',
          offsetX: -4,
          offsetY: 16,
        },
        {
          originX: 'start',
          originY: 'top',
          overlayX: 'start',
          overlayY: 'bottom',
          offsetX: 4,
          offsetY: -16,
        },
        {
          originX: 'end',
          originY: 'top',
          overlayX: 'end',
          overlayY: 'bottom',
          offsetX: -4,
          offsetY: -16,
        },
      ]);

    const overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      panelClass: 'codex-match-chooser-overlay',
    });
    this.overlayRef = overlayRef;

    const componentRef = overlayRef.attach(new ComponentPortal(CodexMatchChooserComponent));
    componentRef.setInput('entries', entries);
    componentRef.instance.entrySelected.subscribe((entryId) => {
      this.close();
      void this.codexEntryOpener.open(entryId);
    });
    componentRef.instance.closeRequested.subscribe(() => this.close());
    overlayRef.backdropClick().subscribe(() => this.close());
    overlayRef.detachments().subscribe(() => this.close());
    overlayRef
      .keydownEvents()
      .pipe(filter((event) => event.key === 'Escape'))
      .subscribe((event) => {
        event.preventDefault();
        this.close();
      });
  }

  close(): void {
    const overlayRef = this.overlayRef;
    this.overlayRef = null;
    overlayRef?.dispose();
  }

  private resolveEntries(entryIds: readonly string[]): CodexMatchChooserEntry[] {
    const entriesById = new Map(
      this.codexContextTrie.entries().map((entry) => [entry.id, entry] as const),
    );

    return [...new Set(entryIds)]
      .map((entryId) => entriesById.get(entryId))
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        name: entry.name,
        description: entry.description,
      }))
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
          left.id.localeCompare(right.id),
      );
  }
}
