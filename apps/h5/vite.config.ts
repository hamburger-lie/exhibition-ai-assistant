import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const proxy = {
  '/api': {
    target: process.env.VITE_BFF_PROXY_TARGET ?? 'http://127.0.0.1:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
