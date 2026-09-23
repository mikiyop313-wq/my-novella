import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-electron/**',
      '**/out-tsc/**',
    ],
  },
  plugins: [
    electron({
      main: {
        // Shortcut of `build.lib.entry`
        entry: 'electron/main.ts',
        onstart({ startup }) {
          const electronEnv = { ...process.env };
          delete electronEnv['ELECTRON_RUN_AS_NODE'];

          return startup(undefined, { env: electronEnv });
        },
        vite: {
          build: {
            rollupOptions: {
              external: [
                'electron-updater',
                'better-sqlite3',
                '@lancedb/lancedb',
                '@xenova/transformers',
                'onnxruntime-node',
                'sharp',
              ],
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
