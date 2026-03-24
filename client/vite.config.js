import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: parseInt(process.env.CLIENT_PORT || '34891'),
    proxy: {
      '/api': {
        target: `http://server:${process.env.SERVER_PORT || '34892'}`,
        changeOrigin: true,
      },
    },
  },
});
