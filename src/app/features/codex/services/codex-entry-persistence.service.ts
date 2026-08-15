import { Injectable, inject } from '@angular/core';

import {
  type CodexEntryDetailDto,
  type CodexEntryDto,
  type UpdateCodexEntryDto,
} from '../../../../../shared/models/codex.model';
import {
  type CodexEntryMenuPayload,
  type CodexEntryNoteInput,
  type CodexEntryProgressionPayload,
} from '../../../../../shared/models/codex-window.model';
import { CodexService } from './codex.service';

@Injectable({
  providedIn: 'root',
})
export class CodexEntryPersistenceService {
  private readonly codexService = inject(CodexService);

  async createEntry(bookId: string | null, entryData: CodexEntryMenuPayload): Promise<CodexEntryDetailDto> {
    if (!bookId) {
      throw new Error('Open a book before creating a codex entry.');
    }

    const createdEntry = await this.codexService.createEntry({
      bookId,
      type: entryData.type,
      name: entryData.name,
      alias: entryData.alias || null,
      description: entryData.description || null,
      image: entryData.image,
      trackingSetting: entryData.trackingSetting,
    });

    await Promise.all(
      entryData.notes.map(note => this.codexService.createEntryNote({
        codexEntryId: createdEntry.id,
        content: this.serializeNote(note),
      })),
    );

    await Promise.all(
      entryData.progression.map(item => this.codexService.createEntryProgression({
        codexEntryId: createdEntry.id,
        title: item.title,
        description: item.description,
        sceneId: item.sceneId,
      })),
    );

    const detail = await this.codexService.getEntry(createdEntry.id);
    if (!detail) {
      throw new Error('Created codex entry could not be loaded.');
    }

    return detail;
  }

  async updateEntry(
    selectedEntry: CodexEntryDetailDto,
    entryData: CodexEntryMenuPayload,
  ): Promise<CodexEntryDetailDto> {
    const updateData: UpdateCodexEntryDto = {
      type: entryData.type,
      name: entryData.name,
      alias: entryData.alias || null,
      description: entryData.description || null,
      trackingSetting: entryData.trackingSetting,
      ...(entryData.image !== undefined ? { image: entryData.image } : {}),
    };
    const updatedEntry = await this.codexService.updateEntry(selectedEntry.id, updateData);

    if (!updatedEntry) {
      throw new Error('Codex entry not found.');
    }

    await this.syncEntryNotes(selectedEntry, entryData.notes);
    await this.syncEntryProgression(selectedEntry, entryData.progression);

    const refreshedEntry = await this.codexService.getEntry(selectedEntry.id);
    if (!refreshedEntry) {
      throw new Error('Updated codex entry could not be loaded.');
    }

    return refreshedEntry;
  }

  async archiveEntry(entry: CodexEntryDto): Promise<CodexEntryDto> {
    const archivedEntry = await this.codexService.updateEntry(entry.id, {
      status: 'archived',
    });

    if (!archivedEntry) {
      throw new Error('Codex entry not found.');
    }

    return archivedEntry;
  }

  async restoreEntry(entry: CodexEntryDto): Promise<CodexEntryDto> {
    const restoredEntry = await this.codexService.updateEntry(entry.id, {
      status: 'active',
    });

    if (!restoredEntry) {
      throw new Error('Codex entry not found.');
    }

    return restoredEntry;
  }

  async deleteEntry(entry: CodexEntryDto): Promise<void> {
    const result = await this.codexService.deleteEntry(entry.id);

    if (!result.success) {
      throw new Error('Failed to delete codex entry.');
    }
  }

  private serializeNote(note: CodexEntryNoteInput): string {
    if (note.title && note.content) return `${note.title}\n\n${note.content}`;

    return note.title || note.content;
  }

  private async syncEntryNotes(
    entry: CodexEntryDetailDto,
    notes: CodexEntryNoteInput[],
  ): Promise<void> {
    const existingNotesById = new Map(entry.entryNotes.map(note => [note.id, note]));
    const incomingNoteIds = new Set<string>();

    for (const [index, note] of notes.entries()) {
      const content = this.serializeNote(note);
      const existingNote = note.id
        ? existingNotesById.get(note.id)
        : entry.entryNotes[index];

      if (existingNote && !incomingNoteIds.has(existingNote.id)) {
        incomingNoteIds.add(existingNote.id);
        if (existingNote.content !== content) {
          await this.codexService.updateEntryNote(existingNote.id, { content });
        }
        continue;
      }

      await this.codexService.createEntryNote({
        codexEntryId: entry.id,
        content,
      });
    }

    await Promise.all(
      entry.entryNotes
        .filter(note => !incomingNoteIds.has(note.id))
        .map(note => this.codexService.deleteEntryNote(note.id)),
    );
  }

  private async syncEntryProgression(
    entry: CodexEntryDetailDto,
    progression: CodexEntryProgressionPayload[],
  ): Promise<void> {
    const existingProgressionById = new Map(
      entry.entryProgression.map(item => [item.id, item]),
    );
    const incomingProgressionIds = new Set<string>();

    for (const [index, item] of progression.entries()) {
      const normalizedItem = {
        title: item.title,
        description: item.description,
        sceneId: item.sceneId,
      };
      const existingProgression = item.id
        ? existingProgressionById.get(item.id)
        : entry.entryProgression[index];

      if (existingProgression && !incomingProgressionIds.has(existingProgression.id)) {
        incomingProgressionIds.add(existingProgression.id);
        if (
          existingProgression.title !== normalizedItem.title ||
          existingProgression.description !== normalizedItem.description ||
          existingProgression.sceneId !== normalizedItem.sceneId
        ) {
          await this.codexService.updateEntryProgression(existingProgression.id, normalizedItem);
        }
        continue;
      }

      await this.codexService.createEntryProgression({
        codexEntryId: entry.id,
        ...normalizedItem,
      });
    }

    await Promise.all(
      entry.entryProgression
        .filter(item => !incomingProgressionIds.has(item.id))
        .map(item => this.codexService.deleteEntryProgression(item.id)),
    );
  }
}
