import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    exclude: ["tests/**", "playwright.config.ts"],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5188',
    },
  },
});
