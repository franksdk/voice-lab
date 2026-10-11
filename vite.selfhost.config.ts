import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  root: resolve(import.meta.dirname, 'selfhost'),
  publicDir: resolve(import.meta.dirname, 'public'),
  base: '/voice-lab/',
  plugins: [react()],
  resolve: { alias: { '@': import.meta.dirname } },
  build: { outDir: resolve(import.meta.dirname, 'dist-selfhost'), emptyOutDir: true, sourcemap: false },
});
