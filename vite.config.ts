import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: { assetsInlineLimit: 0 },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
})
