import { defineConfig } from 'vite';

// The Vig's dev server lives on 5180 so it never collides with another project's 5173.
// `npm run serve:e2e` serves on 5181 with no hot reload, so a long e2e sweep or a playtest isn't
// torn down when a source file is saved mid-run (BASE=http://127.0.0.1:5181/ npm run screens).
export default defineConfig(({ mode }) => ({
  base: './',
  server: { port: 5180, strictPort: true, host: '127.0.0.1', hmr: mode !== 'e2e' },
  preview: { port: 4180, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
}) as any);
