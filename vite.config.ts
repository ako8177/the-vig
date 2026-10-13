import { defineConfig } from 'vite';

// The Vig's dev server lives on 5180 so it never collides with another project's 5173.
export default defineConfig({
  base: './',
  server: { port: 5180, strictPort: true, host: '127.0.0.1' },
  preview: { port: 4180, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as any);
