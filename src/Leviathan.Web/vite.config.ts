import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: '@machina', replacement: fileURLToPath(new URL('../../vendor/MachinaLayout.JS/src', import.meta.url)) },
      { find: /^react$/, replacement: fileURLToPath(new URL('./node_modules/react/index.js', import.meta.url)) },
      { find: /^react\/jsx-runtime$/, replacement: fileURLToPath(new URL('./node_modules/react/jsx-runtime.js', import.meta.url)) },
    ],
  },
  server: {
    fs: { allow: ['../..'] },
    proxy: { '/api': 'http://localhost:5188' },
  },
});
