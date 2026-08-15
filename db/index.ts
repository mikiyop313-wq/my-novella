import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as path from 'path';
import { app } from 'electron';
import { seedLanguages, seedGenres, seedTropes } from './seed';

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

    // Seed data if tables are empty
    seedLanguages().catch(err => console.error('Seeding languages failed:', err));
    seedGenres().catch(err => console.error('Seeding genres failed:', err));
    seedTropes().catch(err => console.error('Seeding tropes failed:', err));
} catch (err) {
    console.error('FAST TEST FAILED:', err);
}