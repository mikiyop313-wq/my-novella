import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import * as schema from '../schema';

// ---------------------------------------------------------------------------
// Database path
// ---------------------------------------------------------------------------

const isDev = process.env['NODE_ENV'] === 'development';
const usesLocalDatabase = isDev || !app;

const LOCAL_DATABASE_DIR = '.data';
const LOCAL_DATABASE_PATH = path.join(LOCAL_DATABASE_DIR, 'my-novella.db');
const USER_DATABASE_NAME = 'my-novella.sqlite';

// Drizzle Kit can import this file without an Electron app instance, so that
// path also uses the local database location.
const dbPath = usesLocalDatabase
  ? LOCAL_DATABASE_PATH
  : path.join(app.getPath('userData'), USER_DATABASE_NAME);

if (usesLocalDatabase && !fs.existsSync(LOCAL_DATABASE_DIR)) {
  fs.mkdirSync(LOCAL_DATABASE_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Drizzle client
// ---------------------------------------------------------------------------

const sqlite = new Database(dbPath);

export const db = drizzle(sqlite, { schema });
