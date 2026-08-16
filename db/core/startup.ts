import { vectorDb } from '../../vectors/lancedb.connection';
import { seedGenres, seedLanguages, seedTropes } from '../seeding';
import { db } from './client';
import { migrateDatabase } from './migrator';

export async function initializeDatabase(): Promise<void> {
  await migrateDatabase(db);
  await seedLanguages();
  await seedGenres();
  await seedTropes();
  await vectorDb.connect();
  console.log('Database initialization completed.');
}
