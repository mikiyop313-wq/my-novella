import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import {
  type CodexEntryDetailDto,
  type CodexEntryType,
} from '../../../../../../shared/models/codex.model';
import {
  type CodexDetachedWindowSession,
  type CodexEntryMenuPayload,
  type CodexEntryMenuView,
} from '../../../../../../shared/models/codex-window.model';
import { type ActDto } from '../../../../../../shared/models/manuscript.model';
import { DropdownOption } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { ElectronService } from '../../../../core/services/electron.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { CodexEntryMenuComponent } from '../../components/codex-entry-menu/codex-entry-menu.component';
import { CodexEntryPersistenceService } from '../../services/codex-entry-persistence.service';
import { CodexService } from '../../services/codex.service';
import { CodexWindowService } from '../../services/codex-window.service';
import { createCodexImageUrl, revokeCodexImageUrl } from '../../utils/codex-image-url';

type CodexEntityOption = {
  value: CodexEntryType;
  label: string;
};

const CODEX_ENTITY_OPTIONS: readonly CodexEntityOption[] = [
  { value: 'character', label: 'Character' },
  { value: 'location', label: 'Location' },
  { value: 'object', label: 'Object' },
  { value: 'lore', label: 'Lore' },
  { value: 'subplot', label: 'Subplot' },
  { value: 'other', label: 'Other' },
];

@Component({
  selector: 'app-codex-detached',
  standalone: true,
  imports: [CodexEntryMenuComponent],
  templateUrl: './codex-detached.html',
  styleUrl: './codex-detached.scss',
})
export class CodexDetached implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly electronService = inject(ElectronService);
  private readonly codexService = inject(CodexService);
  private readonly codexWindowService = inject(CodexWindowService);
  private readonly persistenceService = inject(CodexEntryPersistenceService);
  private readonly toastService = inject(ToastService);

  readonly session = signal<CodexDetachedWindowSession | null>(null);
  readonly existingEntry = signal<CodexEntryDetailDto | null>(null);
  readonly initialDraft = signal<CodexEntryMenuPayload | null>(null);
  readonly initialView = signal<CodexEntryMenuView | null>(null);
  readonly bookHierarchy = signal<ActDto[]>([]);
  readonly thumbnailUrl = signal<string | null>(null);
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);

  readonly entityDropdownOptions: DropdownOption[] = CODEX_ENTITY_OPTIONS.map(option => ({
    value: option.value,
    label: option.label,
  }));

  async ngOnInit(): Promise<void> {
    const sessionId = this.route.snapshot.paramMap.get('sessionId');
    if (!sessionId) {
      this.fail('Detached codex session was not provided.');
      return;
    }

    try {
      const session = await this.codexWindowService.getDetachedSession(sessionId);
      if (!session) {
        throw new Error('Detached codex session could not be found.');
      }

      this.session.set(session);
      this.initialDraft.set(session.draft);
      this.initialView.set(session.activeView);

      await Promise.all([
        this.loadBookHierarchy(session.bookId),
        this.loadExistingEntry(session),
      ]);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Failed to open detached codex entry.');
    } finally {
      this.isLoading.set(false);
    }
  }

  ngOnDestroy(): void {
    revokeCodexImageUrl(this.thumbnailUrl());
  }

  close(): void {
    window.close();
  }

  async createEntry(entryData: CodexEntryMenuPayload): Promise<void> {
    const session = this.session();
    if (!session) return;

    try {
      const createdEntry = await this.persistenceService.createEntry(session.bookId, entryData);
      this.existingEntry.set(createdEntry);
      this.initialDraft.set(null);
      this.initialView.set(null);
      this.setThumbnailUrl(createCodexImageUrl(createdEntry.image));
      this.session.set({
        ...session,
        entryId: createdEntry.id,
        initialType: createdEntry.type,
        draft: entryData,
        isArchived: createdEntry.status === 'archived',
      });
      this.notifyEntryChanged(createdEntry.id, createdEntry.type);
      this.toastService.success('Codex entry created.', 'Codex');
    } catch (error) {
      this.showError(error, 'Failed to create codex entry.');
    }
  }

  async updateEntry(entryData: CodexEntryMenuPayload): Promise<void> {
    const entry = this.existingEntry();
    if (!entry) return;

    try {
      const refreshedEntry = await this.persistenceService.updateEntry(entry, entryData);
      this.existingEntry.set(refreshedEntry);
      this.setThumbnailUrl(createCodexImageUrl(refreshedEntry.image));
      this.session.update(session => session
        ? {
            ...session,
            initialType: refreshedEntry.type,
            draft: entryData,
            isArchived: refreshedEntry.status === 'archived',
          }
        : session);
      this.notifyEntryChanged(refreshedEntry.id, refreshedEntry.type);
    } catch (error) {
      this.showError(error, 'Failed to update codex entry.');
    }
  }

  async archiveEntry(): Promise<void> {
    const entry = this.existingEntry();
    if (!entry) return;

    try {
      await this.persistenceService.archiveEntry(entry);
      this.notifyEntryChanged(entry.id, entry.type);
      this.close();
    } catch (error) {
      this.showError(error, 'Failed to archive codex entry.');
    }
  }

  async restoreEntry(): Promise<void> {
    const entry = this.existingEntry();
    if (!entry) return;

    try {
      const restoredEntry = await this.persistenceService.restoreEntry(entry);
      const refreshedEntry = await this.codexService.getEntry(restoredEntry.id);
      if (refreshedEntry) {
        this.existingEntry.set(refreshedEntry);
        this.setThumbnailUrl(createCodexImageUrl(refreshedEntry.image));
        this.session.update(session => session ? { ...session, isArchived: false } : session);
        this.notifyEntryChanged(refreshedEntry.id, refreshedEntry.type);
      }
    } catch (error) {
      this.showError(error, 'Failed to restore codex entry.');
    }
  }

  async deleteEntry(): Promise<void> {
    const entry = this.existingEntry();
    if (!entry) return;

    try {
      await this.persistenceService.deleteEntry(entry);
      this.notifyEntryChanged(entry.id, entry.type);
      this.close();
    } catch (error) {
      this.showError(error, 'Failed to delete codex entry.');
    }
  }

  private async loadExistingEntry(session: CodexDetachedWindowSession): Promise<void> {
    if (!session.entryId) return;

    const entry = await this.codexService.getEntry(session.entryId);
    if (!entry) {
      throw new Error('Codex entry could not be loaded.');
    }

    this.existingEntry.set(entry);
    this.setThumbnailUrl(createCodexImageUrl(entry.image));
  }

  private async loadBookHierarchy(bookId: string | null): Promise<void> {
    if (!bookId) return;

    try {
      const hierarchy = await this.electronService.invoke('manuscript:getBookHierarchy', {
        mode: 'book',
        id: bookId,
      }) as ActDto[];
      this.bookHierarchy.set(hierarchy);
    } catch {
      this.bookHierarchy.set([]);
    }
  }

  private setThumbnailUrl(url: string | null): void {
    revokeCodexImageUrl(this.thumbnailUrl());
    this.thumbnailUrl.set(url);
  }

  private notifyEntryChanged(entryId: string | null, type: CodexEntryType): void {
    this.codexWindowService.notifyDetachedEntryChanged({
      bookId: this.session()?.bookId ?? null,
      entryId,
      type,
    });
  }

  private fail(message: string): void {
    this.error.set(message);
    this.isLoading.set(false);
  }

  private showError(error: unknown, fallback: string): void {
    const message = error instanceof Error ? error.message : fallback;
    this.error.set(message);
    this.toastService.error(message, 'Codex');
  }
}
