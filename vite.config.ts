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
        // Снимаем type="module" (под file:// внешний модуль не исполняется) и
        // ставим defer — иначе классический скрипт в <head> стартует ДО <body>,
        // и #root ещё не существует. crossorigin тоже убираем.
        return html.replace(/ type="module"/g, ' defer').replace(/ crossorigin/g, '');
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
    target: 'chrome108',        // Electron 22 = Chromium 108 (поддержка Win7/8.1)
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
