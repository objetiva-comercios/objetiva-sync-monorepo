import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/store/schema.ts',
  out: './src/store/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './database/objetiva-sync.db',
  },
  verbose: true,
  strict: true,
});
