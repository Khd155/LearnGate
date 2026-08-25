import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Built assets are served from /admin/ on the production domain
// (the Node server serves public/khaldiya/ as the site root, and we
// copy this app's dist/ output into public/khaldiya/admin/).
export default defineConfig({
  plugins: [react()],
  // Absolute, not relative ('./') — this app is always mounted at the fixed
  // path /admin/ off the site root, never opened from a different domain or
  // sub-path. An absolute base keeps every asset URL resolving correctly
  // regardless of how deep the current browser URL is (e.g. a future
  // /admin/students/123 route), which a relative base would NOT survive —
  // relative asset paths resolve against the current URL, not the app root,
  // so they'd break on any nested path.
  base: '/admin/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split all node_modules deps into their own chunk: it changes far
        // less often than app code, so browsers keep reusing the cached copy
        // across deploys instead of re-downloading ~1.2MB on every release —
        // the main contributor to the app feeling heavy on first load.
        manualChunks(id: string) {
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
