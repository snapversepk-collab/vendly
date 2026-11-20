import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Local dev: forward /api to the backend so VITE_API_URL can stay empty
    proxy: { '/api': { target: process.env.API_PROXY ?? 'http://localhost:4000', changeOrigin: true } },
  },
})
