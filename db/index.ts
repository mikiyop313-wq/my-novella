import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as path from 'path';
import { app } from 'electron';
//import { users } from './schema';

import * as fs from 'fs';

// Use a local.db file in development, otherwise use the user data folder
// Note: when app is undefined (e.g. during drizzle-kit migration), we default to local.db
const isDev = process.env.NODE_ENV === 'development';
const dbPath = (isDev || !app)
    ? '.data/my-novella.db'
    : path.join(app.getPath('userData'), 'my-novella.sqlite');

if ((isDev || !app) && !fs.existsSync('.data')) {
    fs.mkdirSync('.data', { recursive: true });
}

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });



try {


    console.log('FAST TEST: Users in DB:');
} catch (err) {
    console.error('FAST TEST FAILED:', err);
}