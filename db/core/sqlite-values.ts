export type SqliteBoolean = 0 | 1;
export type SqliteTimestamp = number;

export function toSqliteBoolean(value: boolean): SqliteBoolean {
  return value ? 1 : 0;
}

export function fromSqliteBoolean(value: SqliteBoolean): boolean {
  return value === 1;
}

export function toSqliteTimestamp(value: Date = new Date()): SqliteTimestamp {
  return Math.floor(value.getTime() / 1000);
}

export function fromSqliteTimestamp(value: SqliteTimestamp | null): Date | null {
  return value === null ? null : new Date(value * 1000);
}

export function serializeSqliteJson<T>(value: T | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

export function parseSqliteJson<T>(value: string | null): T | null {
  return value === null ? null : (JSON.parse(value) as T);
}

export function toIpcBinary(value: Buffer | null): Uint8Array | null {
  return value === null ? null : new Uint8Array(value);
}
