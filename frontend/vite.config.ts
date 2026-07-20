import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Native dev (this Vite server running directly on the host) reaches the
// backend at localhost:8000. In the Docker Compose hot-reload override the
// frontend and backend are separate containers on the compose network,
// where "localhost" means the frontend container itself — BACKEND_URL lets
// that override point this at the "backend" service name instead.
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Forward API and avatar-image requests to the FastAPI backend so the
    // browser only ever talks to this dev server (single port to expose).
    proxy: {
      // ws:true also proxies the voice call WebSocket (/api/voice/ws)
      '/api': { target: backendUrl, ws: true },
      '/static': backendUrl,
    },
    // Cloudflare quick tunnels get a random *.trycloudflare.com hostname.
    allowedHosts: ['.trycloudflare.com'],
    // The Docker Compose hot-reload override bind-mounts ./frontend from the
    // Windows host into the container; native inotify events don't cross
    // that boundary, so chokidar never sees host-side edits without polling.
    watch: { usePolling: true },
  },
})
