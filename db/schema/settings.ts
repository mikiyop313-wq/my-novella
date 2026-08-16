import type { Insertable, Selectable, Updateable } from 'kysely';

export interface AppSettingsTable {
  key: string;
  value: string;
}

export type AppSettingsRow = Selectable<AppSettingsTable>;
export type NewAppSettingsRow = Insertable<AppSettingsTable>;
export type AppSettingsUpdate = Updateable<AppSettingsTable>;
