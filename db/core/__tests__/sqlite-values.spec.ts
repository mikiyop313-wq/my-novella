import { describe, expect, it } from 'vitest';

import {
  fromSqliteBoolean,
  fromSqliteTimestamp,
  parseSqliteJson,
  serializeSqliteJson,
  toIpcBinary,
  toSqliteBoolean,
  toSqliteTimestamp,
} from '../sqlite-values';

describe('SQLite value conversions', () => {
  it('converts booleans to SQLite integers and back', () => {
    expect(toSqliteBoolean(false)).toBe(0);
    expect(toSqliteBoolean(true)).toBe(1);
    expect(fromSqliteBoolean(0)).toBe(false);
    expect(fromSqliteBoolean(1)).toBe(true);
  });

  it('converts dates using Unix epoch seconds', () => {
    const date = new Date('2026-08-16T10:11:12.987Z');
    const stored = toSqliteTimestamp(date);
    expect(stored).toBe(1786875072);
    expect(fromSqliteTimestamp(stored)?.toISOString()).toBe('2026-08-16T10:11:12.000Z');
    expect(fromSqliteTimestamp(null)).toBeNull();
  });

  it('round-trips JSON and binary values', () => {
    const document = { type: 'doc', content: [{ type: 'paragraph' }] };
    expect(parseSqliteJson(serializeSqliteJson(document))).toEqual(document);
    expect(parseSqliteJson(null)).toBeNull();
    expect(toIpcBinary(Buffer.from([1, 2, 3]))).toEqual(new Uint8Array([1, 2, 3]));
  });
});
