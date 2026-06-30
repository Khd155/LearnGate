import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Built assets are served from /admin/ on the production domain
// (the Node server serves public/khaldiya/ as the site root, and we
// copy this app's dist/ output into public/khaldiya/admin/).
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
