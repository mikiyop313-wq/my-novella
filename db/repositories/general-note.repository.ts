import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import type {
  CreateGeneralNoteDto,
  GeneralNoteDto,
  UpdateGeneralNoteDto,
} from '../../shared/models/general-note.model';
import { fromSqliteTimestamp, toSqliteTimestamp } from '../core/sqlite-values';
import { db } from '../index';
import type { GeneralNoteRow } from '../schema';

export class GeneralNoteRepository {
  async getNotes(bookId: string): Promise<GeneralNoteDto[]> {
    const rows = await db
      .selectFrom('generalNotes')
      .selectAll()
      .where('bookId', '=', bookId)
      .orderBy(sql`coalesce(nullif(title, ''), 'Untitled') collate nocase`)
      .orderBy('createdAt')
      .orderBy('id')
      .execute();

    return rows.map(mapGeneralNoteRow);
  }

  async create(data: CreateGeneralNoteDto): Promise<GeneralNoteDto> {
    return db.transaction().execute(async transaction => {
      const timestamp = toSqliteTimestamp();
      const created = await transaction
        .insertInto('generalNotes')
        .values({
          id: randomUUID(),
          bookId: data.bookId,
          title: data.title,
          content: data.content,
          createdAt: timestamp,
          lastEditedAt: timestamp,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await transaction
        .updateTable('books')
        .set({ lastEditedAt: timestamp })
        .where('id', '=', data.bookId)
        .execute();

      return mapGeneralNoteRow(created);
    });
  }

  async update(id: string, data: UpdateGeneralNoteDto): Promise<GeneralNoteDto | undefined> {
    return db.transaction().execute(async transaction => {
      const timestamp = toSqliteTimestamp();
      const updated = await transaction
        .updateTable('generalNotes')
        .set({ ...data, lastEditedAt: timestamp })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

      if (updated) {
        await transaction
          .updateTable('books')
          .set({ lastEditedAt: timestamp })
          .where('id', '=', updated.bookId)
          .execute();
      }

      return updated ? mapGeneralNoteRow(updated) : undefined;
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return db.transaction().execute(async transaction => {
      const note = await transaction
        .selectFrom('generalNotes')
        .select('bookId')
        .where('id', '=', id)
        .executeTakeFirst();

      if (!note) return { success: false };

      await transaction.deleteFrom('generalNotes').where('id', '=', id).execute();
      await transaction
        .updateTable('books')
        .set({ lastEditedAt: toSqliteTimestamp() })
        .where('id', '=', note.bookId)
        .execute();

      return { success: true };
    });
  }
}

function mapGeneralNoteRow(note: GeneralNoteRow): GeneralNoteDto {
  return {
    ...note,
    createdAt: dateToIso(note.createdAt),
    lastEditedAt: dateToIso(note.lastEditedAt),
  };
}

function dateToIso(value: number | null): string {
  return (fromSqliteTimestamp(value) ?? new Date(0)).toISOString();
}

export const generalNoteRepository = new GeneralNoteRepository();
