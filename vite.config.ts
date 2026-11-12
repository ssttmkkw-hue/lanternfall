import { defineConfig } from 'vitest/config';

// base './' keeps every asset URL relative, so the build works from any GitHub Pages subpath.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
