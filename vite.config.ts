import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_PORT = process.env.API_PORT || '8787'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
      // 上传的原图由 API 服务托管，开发时一并代理
      '/uploads': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
  },
})
