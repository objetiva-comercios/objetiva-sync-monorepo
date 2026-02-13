import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Vite configuration for React dashboard
 *
 * Builds the React dashboard from src/dashboard-react to dist/dashboard-react.
 * Served at /dashboard/ path in production.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: './src/dashboard-react',
  base: '/dashboard/',
  build: {
    outDir: '../../dist/dashboard-react',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/dashboard-react'),
    },
  },
  server: {
    // Proxy API requests to the Fastify server during development
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
})
