import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom', 'react-i18next', 'i18next', '@supabase/supabase-js'] },
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://127.0.0.1:5005', changeOrigin: true } },
  },
  build: { outDir: '../server/public/research', emptyOutDir: true },
});
