import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, path.resolve(__dirname, '..'), ''),
    ...loadEnv(mode, process.cwd(), ''),
  };
  const apiUrl = env.VITE_API_URL ?? process.env.VITE_API_URL;
  const apiPort =
    env.VITE_API_PORT ??
    process.env.VITE_API_PORT ??
    process.env.PORT ??
    env.PORT ??
    '5001';
  const apiTarget =
    apiUrl && /^https?:\/\//i.test(apiUrl)
      ? new URL(apiUrl).origin
      : `http://localhost:${apiPort}`;

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [tailwindcss(), react()],
    server: {
      port: 5173,
      allowedHosts: ['sturdy-lamp-965x6jqrgg6xcp97r-5173.app.github.dev'],
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
