import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as path from 'path';
import { app } from 'electron';

// Use a local.db file in development, otherwise use the user data folder
// Note: when app is undefined (e.g. during drizzle-kit migration), we default to local.db
const isDev = process.env.NODE_ENV === 'development';
const dbPath = (isDev || !app)
    ? 'local.db' 
    : path.join(app.getPath('userData'), 'database.sqlite');

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });
