import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    {
      // Vite помечает входной скрипт как type="module"; под file:// внешний
      // module-скрипт не исполняется. Бандл собран как IIFE (без import/export),
      // поэтому снимаем type="module"/crossorigin → классический <script src>.
      name: 'classic-script-for-file-protocol',
      transformIndexHtml(html: string) {
        return html.replace(/\s+type="module"/g, '').replace(/\s+crossorigin/g, '');
      },
    },
  ],
  base: './',
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Electron грузит index.html по file://, где ES-модули (<script type="module">)
    // не исполняются надёжно. Собираем один классический IIFE-бандл — обычный
    // <script src> грузится с file:// без проблем.
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: { port: 5173 },
})
