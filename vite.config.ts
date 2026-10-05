import { defineConfig } from 'vitest/config';
import pkg from './package.json';

// Relative base so the production build works from any sub-path (e.g. GitHub Pages project sites).
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'babylon-gui', test: /node_modules[\\/]@babylonjs[\\/]gui/ },
            { name: 'babylon', test: /node_modules[\\/]@babylonjs/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
