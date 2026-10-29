import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
// @ts-expect-error plain ESM module shared with the standalone server
import { createApiHandler } from './server/generations.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'context-viewer-api',
      configureServer(server) {
        server.middlewares.use(createApiHandler({ cwd: process.cwd() }));
      },
      configurePreviewServer(server) {
        server.middlewares.use(createApiHandler({ cwd: process.cwd() }));
      },
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), 'web-worker': fileURLToPath(new URL('./src/shims/web-worker.ts', import.meta.url)) } },
  optimizeDeps: { include: ['cytoscape', 'cytoscape-fcose', 'cytoscape-elk', 'cytoscape-svg', 'marked', 'react', 'react-dom/client', 'zustand', 'zustand/react/shallow', '@tanstack/react-virtual', '@deck.gl/core', '@deck.gl/layers', '@deck.gl/react', '@deck.gl/extensions', 'd3-hierarchy'] },
  worker: { format: 'es' },
});
