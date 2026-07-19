import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Forward API and avatar-image requests to the FastAPI backend so the
    // browser only ever talks to this dev server (single port to expose).
    proxy: {
      // ws:true also proxies the voice call WebSocket (/api/voice/ws)
      '/api': { target: 'http://localhost:8000', ws: true },
      '/static': 'http://localhost:8000',
    },
    // Cloudflare quick tunnels get a random *.trycloudflare.com hostname.
    allowedHosts: ['.trycloudflare.com'],
  },
})
