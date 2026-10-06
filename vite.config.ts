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
    // Babylon.js loads shaders through dynamic imports; default code splitting keeps those as
    // small on-demand chunks so WebGL never downloads WebGPU (WGSL) shader code.
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
