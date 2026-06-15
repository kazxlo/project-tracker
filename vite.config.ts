import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/project-tracker/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    // 生产构建时移除所有 console/debugger，防止信息泄露
    minify: 'esbuild',
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
});
