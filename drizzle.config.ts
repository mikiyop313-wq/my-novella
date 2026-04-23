import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema/*',
  out: './db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: '.data/my-novella.db',
  },
});
