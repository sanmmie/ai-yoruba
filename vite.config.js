// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  root:      '.',
  publicDir: 'public',
  build: {
    outDir:    'dist',
    sourcemap: mode !== 'production',
    minify:    'terser',
    terserOptions: { compress: { drop_console: true, drop_debugger: true } },
    rollupOptions: {
      input: {
        main:    new URL('./index.html',   import.meta.url).pathname,
        pricing: new URL('./pricing.html', import.meta.url).pathname,
      },
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5001', rewrite: p => p.replace(/^\/api/, ''), changeOrigin: true },
    },
  },
}));
