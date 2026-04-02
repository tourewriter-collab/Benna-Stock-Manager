import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    // Use relative paths for assets in all modes (Electron file:// compatible)
    base: './',
    server: {
      port: 3000,
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        external: ['better-sqlite3'], // Prevents Vite from trying to "bundle" the database
      },
    },
    define: {
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
    },
  };
});