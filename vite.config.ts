import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'apps/web', plugins: [react(), tailwindcss()], define: { global: 'globalThis' },
  resolve: { alias: { '@': resolve(import.meta.dirname, 'apps/web/src') } },
  build: { outDir: '../../dist', emptyOutDir: true },
  test: { root: '.', include: ['packages/**/*.test.ts', 'services/**/*.test.ts', 'infrastructure/**/*.test.ts'] },
});
