import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Separate Vite config for the content script.
 *
 * Chrome MV3 content scripts run as plain scripts (no `<script type="module">`),
 * so the bundle must be an IIFE with all imports inlined. The main
 * `vite.config.ts` outputs ES modules for the popup, options page, and
 * service worker; this second config rebuilds just the content script
 * in IIFE format into the same `dist/` directory.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@background': resolve(__dirname, 'src/background'),
      '@content': resolve(__dirname, 'src/content'),
      '@popup': resolve(__dirname, 'src/popup'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false, // The main build runs first and owns this dir.
    rollupOptions: {
      input: {
        'content-script': resolve(__dirname, 'src/content/content-script.ts'),
      },
      output: {
        format: 'iife',
        entryFileNames: 'src/content/[name].js',
        inlineDynamicImports: true,
      },
    },
  },
});
