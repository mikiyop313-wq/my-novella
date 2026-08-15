import { eq } from 'drizzle-orm';

import { db } from '../core/client';
import { settings } from '../schema';

export interface AppSettingsStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class AppSettingsRepository implements AppSettingsStore {
  async get(key: string): Promise<string | null> {
    const row = await db.query.settings.findFirst({
      where: eq(settings.key, key),
    });

    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value },
      });
  }

  async delete(key: string): Promise<void> {
    await db.delete(settings).where(eq(settings.key, key));
  }
}

export const appSettingsRepository = new AppSettingsRepository();
