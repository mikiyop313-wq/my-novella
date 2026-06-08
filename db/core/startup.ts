import { seedGenres, seedLanguages, seedTropes } from '../seeding';
import { vectorDb } from '../../vectors/lancedb.connection';

function runStartupTask(taskName: string, task: () => Promise<unknown>): void {
  task().catch((error) => {
    console.error(`${taskName} failed:`, error);
  });
}

export function runDatabaseStartupTasks(): void {
  try {
    runStartupTask('Seeding languages', seedLanguages);
    runStartupTask('Seeding genres', seedGenres);
    runStartupTask('Seeding tropes', seedTropes);

    runStartupTask('LanceDB initialization', async () => {
      await vectorDb.getManuscriptTable();
      console.log('LanceDB manuscript table ready.');
    });
  } catch (error) {
    console.error('Database startup failed:', error);
  }
}
