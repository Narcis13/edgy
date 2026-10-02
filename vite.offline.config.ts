// The app as it runs inside an exported .html file: one script and one
// stylesheet, nothing loaded later. The server puts them into each export with
// the fonts that document needs (see src/server/export.ts).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  // Never fetch a module preload helper or anything else at run time.
  build: {
    outDir: 'dist/offline',
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    // Fonts stay files here; an export inlines only those its document uses.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      input: 'src/web/offline/main.tsx',
      output: {
        format: 'es',
        inlineDynamicImports: true,
        entryFileNames: 'offline.js',
        assetFileNames: (a) => (a.names?.[0]?.endsWith('.css') ? 'offline.css' : 'fonts/[name]-[hash][extname]'),
      },
    },
  },
});
