import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  plugins: [
    electron({
      main: {
        // Shortcut of `build.lib.entry`
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3', '@lancedb/lancedb'],
            },
          },
        },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`
        input: 'electron/preload.ts',
      },
      // Optional: Use Node.js API in the Renderer process
      // renderer: {},
    }),
  ],
});
