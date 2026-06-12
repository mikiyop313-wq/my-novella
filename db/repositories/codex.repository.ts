import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  like,
  ne,
  notExists,
  or,
} from 'drizzle-orm';

import { db } from '../index';
import { codexEntries, codexEntryNotes, codexEntryProgression } from '../schema';
import {
  CodexEntryDetailDto,
  CodexEntryDto,
  CodexEntryNoteDto,
  CodexEntryProgressionDto,
  CodexEntryListFiltersDto,
  CodexEntryType,
  CodexEntryTypeCountDto,
  CreateCodexEntryNoteDto,
  CreateCodexEntryProgressionDto,
  CreateCodexEntryDto,
  UpdateCodexEntryNoteDto,
  UpdateCodexEntryProgressionDto,
  UpdateCodexEntryDto,
} from '../../shared/models/codex.model';

type CodexEntryEntity = typeof codexEntries.$inferSelect;
type CodexEntryInsert = typeof codexEntries.$inferInsert;
type CodexEntryUpdate = Partial<Omit<CodexEntryInsert, 'id' | 'bookId' | 'createdAt'>>;
type CodexImageInput = CodexEntryDto['image'] | undefined;
type CodexEntryNoteEntity = typeof codexEntryNotes.$inferSelect;
type CodexEntryProgressionEntity = typeof codexEntryProgression.$inferSelect;

const CODEX_ENTRY_TYPES: CodexEntryType[] = [
  'character',
  'location',
  'object',
  'lore',
  'subplot',
  'other',
];

export class CodexRepository {
  // -----------------------------------------------------------------------
  // Mapping helpers
  // -----------------------------------------------------------------------

  private mapToDto(entry: CodexEntryEntity): CodexEntryDto {
    return {
      id: entry.id,
      bookId: entry.bookId,
      type: entry.type,
      name: entry.name,
      alias: entry.alias,
      description: entry.description,
      image: this.mapImageForIpc(entry.image),
      status: entry.status,
      trackingSetting: entry.trackingSetting,
      createdAt: entry.createdAt.toISOString(),
      lastEditedAt: entry.lastEditedAt.toISOString(),
    };
  }

  private mapNoteToDto(note: CodexEntryNoteEntity): CodexEntryNoteDto {
    return {
      id: note.id,
      codexEntryId: note.codexEntryId,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
      lastEditedAt: note.lastEditedAt.toISOString(),
    };
  }

  private mapProgressionToDto(
    progression: CodexEntryProgressionEntity,
  ): CodexEntryProgressionDto {
    return {
      id: progression.id,
      codexEntryId: progression.codexEntryId,
      title: progression.title,
      description: progression.description,
      sceneId: progression.sceneId,
      createdAt: progression.createdAt.toISOString(),
      lastEditedAt: progression.lastEditedAt.toISOString(),
    };
  }

  private mapImageForIpc(image: CodexEntryEntity['image']): CodexEntryDto['image'] {
    if (image && Buffer.isBuffer(image)) {
      return new Uint8Array(image);
    }

    return image as CodexEntryDto['image'];
  }

  private dataUrlToBuffer(dataUrl: CodexImageInput): Buffer | CodexImageInput {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return dataUrl;
    }

    const base64 = dataUrl.split(',')[1];
    return Buffer.from(base64, 'base64');
  }

  private createListWhere(bookId: string, filters?: CodexEntryListFiltersDto) {
    const clauses = [eq(codexEntries.bookId, bookId)];

    if (filters?.status) {
      clauses.push(eq(codexEntries.status, filters.status));
    } else if (!filters?.includeArchived) {
      clauses.push(eq(codexEntries.status, 'active'));
    }

    if (filters?.type) {
      clauses.push(eq(codexEntries.type, filters.type));
    }

    if (filters?.hasDescription !== undefined) {
      clauses.push(
        filters.hasDescription
          ? ne(codexEntries.description, '')
          : or(isNull(codexEntries.description), eq(codexEntries.description, ''))!,
      );
    }

    if (filters?.hasNotes !== undefined) {
      const notesQuery = db
        .select({ id: codexEntryNotes.id })
        .from(codexEntryNotes)
        .where(eq(codexEntryNotes.codexEntryId, codexEntries.id));

      clauses.push(filters.hasNotes ? exists(notesQuery) : notExists(notesQuery));
    }

    if (filters?.hasProgression !== undefined) {
      const progressionQuery = db
        .select({ id: codexEntryProgression.id })
        .from(codexEntryProgression)
        .where(eq(codexEntryProgression.codexEntryId, codexEntries.id));

      clauses.push(filters.hasProgression ? exists(progressionQuery) : notExists(progressionQuery));
    }

    if (filters?.trackingSettings?.length) {
      clauses.push(inArray(codexEntries.trackingSetting, filters.trackingSettings));
    }

    const search = filters?.search?.trim();

    if (search) {
      const searchPattern = `%${search}%`;
      clauses.push(
        or(
          like(codexEntries.name, searchPattern),
          like(codexEntries.alias, searchPattern),
          like(codexEntries.description, searchPattern),
        )!,
      );
    }

    return and(...clauses);
  }

  private createInsert(data: CreateCodexEntryDto): CodexEntryInsert {
    return {
      bookId: data.bookId,
      type: data.type,
      name: data.name,
      alias: data.alias ?? null,
      description: data.description ?? null,
      image: this.dataUrlToBuffer(data.image) as CodexEntryInsert['image'],
      status: data.status ?? 'active',
      trackingSetting: data.trackingSetting ?? 'include_when_detected',
    };
  }

  private createUpdate(data: UpdateCodexEntryDto): CodexEntryUpdate {
    const updatePayload: CodexEntryUpdate = {
      lastEditedAt: new Date(),
    };

    if (data.type !== undefined) updatePayload.type = data.type;
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.alias !== undefined) updatePayload.alias = data.alias;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.image !== undefined)
      updatePayload.image = this.dataUrlToBuffer(data.image) as CodexEntryUpdate['image'];
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.trackingSetting !== undefined) updatePayload.trackingSetting = data.trackingSetting;

    return updatePayload;
  }

  private async ensureEntryExists(entryId: string): Promise<void> {
    const entry = await db.query.codexEntries.findFirst({
      where: eq(codexEntries.id, entryId),
      columns: { id: true },
    });

    if (!entry) {
      throw new Error('Codex entry not found');
    }
  }

  private async touchEntryLastEdited(entryId: string): Promise<void> {
    await db.update(codexEntries).set({ lastEditedAt: new Date() }).where(eq(codexEntries.id, entryId));
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  async getEntries(
    bookId: string,
    filters?: CodexEntryListFiltersDto,
  ): Promise<CodexEntryDto[]> {
    const results = await db
      .select()
      .from(codexEntries)
      .where(this.createListWhere(bookId, filters))
      .orderBy(desc(codexEntries.lastEditedAt), desc(codexEntries.createdAt));

    return results.map((entry) => this.mapToDto(entry));
  }

  async getById(id: string): Promise<CodexEntryDetailDto | undefined> {
    const entry = await db.query.codexEntries.findFirst({
      where: eq(codexEntries.id, id),
    });

    if (!entry) {
      return undefined;
    }

    return {
      ...this.mapToDto(entry),
      entryNotes: await this.getEntryNotes(id),
      entryProgression: await this.getEntryProgression(id),
    };
  }

  async getEntryNotes(entryId: string): Promise<CodexEntryNoteDto[]> {
    const notes = await db.query.codexEntryNotes.findMany({
      where: eq(codexEntryNotes.codexEntryId, entryId),
      orderBy: [desc(codexEntryNotes.lastEditedAt), desc(codexEntryNotes.createdAt)],
    });

    return notes.map((note) => this.mapNoteToDto(note));
  }

  async getEntryProgression(entryId: string): Promise<CodexEntryProgressionDto[]> {
    const progression = await db.query.codexEntryProgression.findMany({
      where: eq(codexEntryProgression.codexEntryId, entryId),
      orderBy: [
        asc(codexEntryProgression.createdAt),
        asc(codexEntryProgression.lastEditedAt),
      ],
    });

    return progression.map((item) => this.mapProgressionToDto(item));
  }

  async getCounts(bookId: string): Promise<CodexEntryTypeCountDto[]> {
    const rows = await db
      .select({
        type: codexEntries.type,
        count: count(),
      })
      .from(codexEntries)
      .where(and(eq(codexEntries.bookId, bookId), eq(codexEntries.status, 'active')))
      .groupBy(codexEntries.type);

    const countsByType = new Map(rows.map((row) => [row.type, row.count]));

    return CODEX_ENTRY_TYPES.map((type) => ({
      type,
      count: countsByType.get(type) ?? 0,
    }));
  }

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  async create(data: CreateCodexEntryDto): Promise<CodexEntryDto> {
    const [created] = await db.insert(codexEntries).values(this.createInsert(data)).returning();

    return this.mapToDto(created);
  }

  async update(id: string, data: UpdateCodexEntryDto): Promise<CodexEntryDto | undefined> {
    const [updated] = await db
      .update(codexEntries)
      .set(this.createUpdate(data))
      .where(eq(codexEntries.id, id))
      .returning();

    return updated ? this.mapToDto(updated) : undefined;
  }

  async createEntryNote(data: CreateCodexEntryNoteDto): Promise<CodexEntryNoteDto> {
    await this.ensureEntryExists(data.codexEntryId);

    const [created] = await db
      .insert(codexEntryNotes)
      .values({
        codexEntryId: data.codexEntryId,
        content: data.content,
      })
      .returning();

    await this.touchEntryLastEdited(created.codexEntryId);
    return this.mapNoteToDto(created);
  }

  async updateEntryNote(
    id: string,
    data: UpdateCodexEntryNoteDto,
  ): Promise<CodexEntryNoteDto | undefined> {
    const [updated] = await db
      .update(codexEntryNotes)
      .set({
        content: data.content,
        lastEditedAt: new Date(),
      })
      .where(eq(codexEntryNotes.id, id))
      .returning();

    if (updated) {
      await this.touchEntryLastEdited(updated.codexEntryId);
    }

    return updated ? this.mapNoteToDto(updated) : undefined;
  }

  async deleteEntryNote(id: string): Promise<{ success: boolean }> {
    const note = await db.query.codexEntryNotes.findFirst({
      where: eq(codexEntryNotes.id, id),
    });

    await db.delete(codexEntryNotes).where(eq(codexEntryNotes.id, id));

    if (note) {
      await this.touchEntryLastEdited(note.codexEntryId);
    }

    return { success: true };
  }

  async createEntryProgression(
    data: CreateCodexEntryProgressionDto,
  ): Promise<CodexEntryProgressionDto> {
    await this.ensureEntryExists(data.codexEntryId);

    const [created] = await db
      .insert(codexEntryProgression)
      .values({
        codexEntryId: data.codexEntryId,
        title: data.title,
        description: data.description,
        sceneId: data.sceneId ?? null,
      })
      .returning();

    await this.touchEntryLastEdited(created.codexEntryId);
    return this.mapProgressionToDto(created);
  }

  async updateEntryProgression(
    id: string,
    data: UpdateCodexEntryProgressionDto,
  ): Promise<CodexEntryProgressionDto | undefined> {
    const [updated] = await db
      .update(codexEntryProgression)
      .set({
        ...data,
        lastEditedAt: new Date(),
      })
      .where(eq(codexEntryProgression.id, id))
      .returning();

    if (updated) {
      await this.touchEntryLastEdited(updated.codexEntryId);
    }

    return updated ? this.mapProgressionToDto(updated) : undefined;
  }

  async deleteEntryProgression(id: string): Promise<{ success: boolean }> {
    const progression = await db.query.codexEntryProgression.findFirst({
      where: eq(codexEntryProgression.id, id),
    });

    await db.delete(codexEntryProgression).where(eq(codexEntryProgression.id, id));

    if (progression) {
      await this.touchEntryLastEdited(progression.codexEntryId);
    }

    return { success: true };
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await db.delete(codexEntries).where(eq(codexEntries.id, id));
    return { success: true };
  }
}

export const codexRepository = new CodexRepository();
