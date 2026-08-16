import { randomUUID } from 'crypto';
import { sql } from 'kysely';

import type {
  CodexEntryDetailDto,
  CodexEntryDto,
  CodexEntryListFiltersDto,
  CodexEntryNoteDto,
  CodexEntryProgressionDto,
  CodexEntryType,
  CodexEntryTypeCountDto,
  CreateCodexEntryDto,
  CreateCodexEntryNoteDto,
  CreateCodexEntryProgressionDto,
  UpdateCodexEntryDto,
  UpdateCodexEntryNoteDto,
  UpdateCodexEntryProgressionDto,
} from '../../shared/models/codex.model';
import { db } from '../index';
import type {
  CodexEntryNoteRow,
  CodexEntryProgressionRow,
  CodexEntryRow,
  CodexEntryUpdate,
  NewCodexEntryRow,
} from '../schema';
import {
  fromSqliteTimestamp,
  toIpcBinary,
  toSqliteTimestamp,
} from '../core/sqlite-values';

type CodexImageInput = CodexEntryDto['image'] | undefined;

const CODEX_ENTRY_TYPES: CodexEntryType[] = [
  'character',
  'location',
  'object',
  'lore',
  'subplot',
  'other',
];

export class CodexRepository {
  private mapToDto(entry: CodexEntryRow): CodexEntryDto {
    return {
      ...entry,
      image: toIpcBinary(entry.image),
      createdAt: this.dateToIso(entry.createdAt),
      lastEditedAt: this.dateToIso(entry.lastEditedAt),
    };
  }

  private mapNoteToDto(note: CodexEntryNoteRow): CodexEntryNoteDto {
    return {
      ...note,
      createdAt: this.dateToIso(note.createdAt),
      lastEditedAt: this.dateToIso(note.lastEditedAt),
    };
  }

  private mapProgressionToDto(progression: CodexEntryProgressionRow): CodexEntryProgressionDto {
    return {
      ...progression,
      createdAt: this.dateToIso(progression.createdAt),
      lastEditedAt: this.dateToIso(progression.lastEditedAt),
    };
  }

  private dateToIso(value: number | null): string {
    return (fromSqliteTimestamp(value) ?? new Date(0)).toISOString();
  }

  private dataUrlToBuffer(value: CodexImageInput): Buffer | null {
    if (!value) return null;
    if (typeof value === 'string') {
      return value.startsWith('data:') ? Buffer.from(value.split(',')[1], 'base64') : Buffer.from(value);
    }
    return Buffer.from(value);
  }

  private createInsert(data: CreateCodexEntryDto): NewCodexEntryRow {
    const timestamp = toSqliteTimestamp();
    return {
      id: randomUUID(),
      bookId: data.bookId,
      type: data.type,
      name: data.name,
      alias: data.alias ?? null,
      description: data.description ?? null,
      image: this.dataUrlToBuffer(data.image),
      status: data.status ?? 'active',
      trackingSetting: data.trackingSetting ?? 'include_when_detected',
      createdAt: timestamp,
      lastEditedAt: timestamp,
    };
  }

  private createUpdate(data: UpdateCodexEntryDto): CodexEntryUpdate {
    const update: CodexEntryUpdate = { lastEditedAt: toSqliteTimestamp() };
    if (data.type !== undefined) update.type = data.type;
    if (data.name !== undefined) update.name = data.name;
    if (data.alias !== undefined) update.alias = data.alias;
    if (data.description !== undefined) update.description = data.description;
    if (data.image !== undefined) update.image = this.dataUrlToBuffer(data.image);
    if (data.status !== undefined) update.status = data.status;
    if (data.trackingSetting !== undefined) update.trackingSetting = data.trackingSetting;
    return update;
  }

  private async ensureEntryExists(entryId: string): Promise<void> {
    const entry = await db.selectFrom('codexEntries').select('id').where('id', '=', entryId).executeTakeFirst();
    if (!entry) throw new Error('Codex entry not found');
  }

  private async touchEntryLastEdited(entryId: string): Promise<void> {
    await db.updateTable('codexEntries').set({ lastEditedAt: toSqliteTimestamp() }).where('id', '=', entryId).execute();
  }

  async getEntries(bookId: string, filters?: CodexEntryListFiltersDto): Promise<CodexEntryDto[]> {
    let query = db.selectFrom('codexEntries').selectAll().where('bookId', '=', bookId);
    if (filters?.status) query = query.where('status', '=', filters.status);
    else if (!filters?.includeArchived) query = query.where('status', '=', 'active');
    if (filters?.type) query = query.where('type', '=', filters.type);
    if (filters?.hasDescription === true) {
      query = query.where('description', 'is not', null).where('description', '!=', '');
    } else if (filters?.hasDescription === false) {
      query = query.where((expression) =>
        expression.or([expression('description', 'is', null), expression('description', '=', '')]),
      );
    }
    if (filters?.hasNotes !== undefined) {
      query = query.where((expression) => {
        const notes = expression.exists(
          expression.selectFrom('codexEntryNotes').select('id').whereRef('codexEntryId', '=', 'codexEntries.id'),
        );
        return filters.hasNotes ? notes : expression.not(notes);
      });
    }
    if (filters?.hasProgression !== undefined) {
      query = query.where((expression) => {
        const progression = expression.exists(
          expression.selectFrom('codexEntryProgression').select('id').whereRef('codexEntryId', '=', 'codexEntries.id'),
        );
        return filters.hasProgression ? progression : expression.not(progression);
      });
    }
    if (filters?.trackingSettings?.length) {
      query = query.where('trackingSetting', 'in', filters.trackingSettings);
    }
    const search = filters?.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      query = query.where((expression) =>
        expression.or([
          expression('name', 'like', pattern),
          expression('alias', 'like', pattern),
          expression('description', 'like', pattern),
        ]),
      );
    }
    const rows = await query.orderBy('name').execute();
    return rows.map((row) => this.mapToDto(row));
  }

  async getById(id: string): Promise<CodexEntryDetailDto | undefined> {
    const entry = await db.selectFrom('codexEntries').selectAll().where('id', '=', id).executeTakeFirst();
    if (!entry) return undefined;
    const [entryNotes, entryProgression] = await Promise.all([
      this.getEntryNotes(id),
      this.getEntryProgression(id),
    ]);
    return { ...this.mapToDto(entry), entryNotes, entryProgression };
  }

  async getEntryNotes(entryId: string): Promise<CodexEntryNoteDto[]> {
    const rows = await db.selectFrom('codexEntryNotes').selectAll().where('codexEntryId', '=', entryId).orderBy('lastEditedAt', 'desc').orderBy('createdAt', 'desc').execute();
    return rows.map((row) => this.mapNoteToDto(row));
  }

  async getEntryProgression(entryId: string): Promise<CodexEntryProgressionDto[]> {
    const rows = await db.selectFrom('codexEntryProgression').selectAll().where('codexEntryId', '=', entryId).orderBy('createdAt').orderBy('lastEditedAt').execute();
    return rows.map((row) => this.mapProgressionToDto(row));
  }

  async getCounts(bookId: string): Promise<CodexEntryTypeCountDto[]> {
    const rows = await db
      .selectFrom('codexEntries')
      .select(['type', sql<number>`count(*)`.as('count')])
      .where('bookId', '=', bookId)
      .where('status', '=', 'active')
      .groupBy('type')
      .execute();
    const counts = new Map(rows.map((row) => [row.type, Number(row.count)]));
    return CODEX_ENTRY_TYPES.map((type) => ({ type, count: counts.get(type) ?? 0 }));
  }

  async create(data: CreateCodexEntryDto): Promise<CodexEntryDto> {
    const created = await db.insertInto('codexEntries').values(this.createInsert(data)).returningAll().executeTakeFirstOrThrow();
    return this.mapToDto(created);
  }

  async update(id: string, data: UpdateCodexEntryDto): Promise<CodexEntryDto | undefined> {
    const updated = await db.updateTable('codexEntries').set(this.createUpdate(data)).where('id', '=', id).returningAll().executeTakeFirst();
    return updated ? this.mapToDto(updated) : undefined;
  }

  async createEntryNote(data: CreateCodexEntryNoteDto): Promise<CodexEntryNoteDto> {
    await this.ensureEntryExists(data.codexEntryId);
    const timestamp = toSqliteTimestamp();
    const created = await db.insertInto('codexEntryNotes').values({ id: randomUUID(), codexEntryId: data.codexEntryId, content: data.content, createdAt: timestamp, lastEditedAt: timestamp }).returningAll().executeTakeFirstOrThrow();
    await this.touchEntryLastEdited(created.codexEntryId);
    return this.mapNoteToDto(created);
  }

  async updateEntryNote(id: string, data: UpdateCodexEntryNoteDto): Promise<CodexEntryNoteDto | undefined> {
    const updated = await db.updateTable('codexEntryNotes').set({ content: data.content, lastEditedAt: toSqliteTimestamp() }).where('id', '=', id).returningAll().executeTakeFirst();
    if (updated) await this.touchEntryLastEdited(updated.codexEntryId);
    return updated ? this.mapNoteToDto(updated) : undefined;
  }

  async deleteEntryNote(id: string): Promise<{ success: boolean }> {
    const note = await db.selectFrom('codexEntryNotes').select('codexEntryId').where('id', '=', id).executeTakeFirst();
    await db.deleteFrom('codexEntryNotes').where('id', '=', id).execute();
    if (note) await this.touchEntryLastEdited(note.codexEntryId);
    return { success: true };
  }

  async createEntryProgression(data: CreateCodexEntryProgressionDto): Promise<CodexEntryProgressionDto> {
    await this.ensureEntryExists(data.codexEntryId);
    const timestamp = toSqliteTimestamp();
    const created = await db.insertInto('codexEntryProgression').values({ id: randomUUID(), codexEntryId: data.codexEntryId, title: data.title, description: data.description, sceneId: data.sceneId ?? null, createdAt: timestamp, lastEditedAt: timestamp }).returningAll().executeTakeFirstOrThrow();
    await this.touchEntryLastEdited(created.codexEntryId);
    return this.mapProgressionToDto(created);
  }

  async updateEntryProgression(id: string, data: UpdateCodexEntryProgressionDto): Promise<CodexEntryProgressionDto | undefined> {
    const updated = await db.updateTable('codexEntryProgression').set({ ...data, lastEditedAt: toSqliteTimestamp() }).where('id', '=', id).returningAll().executeTakeFirst();
    if (updated) await this.touchEntryLastEdited(updated.codexEntryId);
    return updated ? this.mapProgressionToDto(updated) : undefined;
  }

  async deleteEntryProgression(id: string): Promise<{ success: boolean }> {
    const progression = await db.selectFrom('codexEntryProgression').select('codexEntryId').where('id', '=', id).executeTakeFirst();
    await db.deleteFrom('codexEntryProgression').where('id', '=', id).execute();
    if (progression) await this.touchEntryLastEdited(progression.codexEntryId);
    return { success: true };
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await db.deleteFrom('codexEntries').where('id', '=', id).execute();
    return { success: true };
  }
}

export const codexRepository = new CodexRepository();
