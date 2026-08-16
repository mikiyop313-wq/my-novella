import { db } from '../core/client';

export interface AppSettingsStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class AppSettingsRepository implements AppSettingsStore {
  async get(key: string): Promise<string | null> {
    const row = await db
      .selectFrom('appSettings')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst();

    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await db
      .insertInto('appSettings')
      .values({ key, value })
      .onConflict((conflict) => conflict.column('key').doUpdateSet({ value }))
      .execute();
  }

  async delete(key: string): Promise<void> {
    await db.deleteFrom('appSettings').where('key', '=', key).execute();
  }
}

export const appSettingsRepository = new AppSettingsRepository();
