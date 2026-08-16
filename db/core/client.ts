import Database from 'better-sqlite3';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import { createDatabaseClient } from './factory';

const isDev = process.env['NODE_ENV'] === 'development';
const usesLocalDatabase = isDev || !app;

const LOCAL_DATABASE_DIR = '.data';
const LOCAL_DATABASE_PATH = path.join(LOCAL_DATABASE_DIR, 'my-novella.db');
const USER_DATABASE_NAME = 'my-novella.sqlite';

export const databasePath = usesLocalDatabase
  ? LOCAL_DATABASE_PATH
  : path.join(app.getPath('userData'), USER_DATABASE_NAME);

if (usesLocalDatabase && !fs.existsSync(LOCAL_DATABASE_DIR)) {
  fs.mkdirSync(LOCAL_DATABASE_DIR, { recursive: true });
}

export const sqlite = new Database(databasePath);
export const db = createDatabaseClient(sqlite);
