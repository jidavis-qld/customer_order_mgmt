import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BASE_PATH = process.env.VITE_BASE_PATH || '/orders';

export default defineConfig({
  plugins: [react()],
  base: BASE_PATH + '/',
  server: {
    port: 5173,
    proxy: {
      [`${BASE_PATH}/api`]: {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      [`${BASE_PATH}/auth`]: {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
