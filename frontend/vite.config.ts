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
  build: {
    rollupOptions: {
      output: {
        /* Le librerie in un file a parte dal codice dell'applicazione.
         *
         * Sono React, il router e la cache delle query, cioè duecentoventi
         * dei quattrocentottanta kilobyte che il browser scaricava in un
         * blocco solo. Quel blocco cambia nome a ogni rilascio, perché nel
         * nome c'è l'impronta del contenuto e il contenuto contiene anche
         * l'ultima riga corretta stamattina: chi torna sull'applicazione
         * riscaricava React per una virgola spostata in una tabella.
         *
         * Diviso in due, il file delle librerie cambia solo quando si
         * aggiorna una dipendenza, quindi resta in cache per settimane (a
         * dichiararlo immutabile è nginx, vedi `nginx.conf`), e un rilascio
         * costa il solo codice dell'applicazione.
         *
         * La regola è "tutto quello che viene da node_modules" e non un
         * elenco di pacchetti scritto a mano: un elenco andrebbe aggiornato
         * a ogni dipendenza nuova, e dimenticarsene non darebbe nessun
         * errore, solo un file che ricomincia a cambiare a ogni rilascio.
         * I fogli di stile restano fuori: quelli di node_modules sono i due
         * caratteri, che Vite raccoglie nel CSS della pagina e non in un
         * file JavaScript. */
        manualChunks(id) {
          if (id.includes('node_modules') && !id.endsWith('.css')) return 'vendor'
        },
      },
    },
  },
  server: {
    // Same port the app is reachable on in every mode (Docker maps it 1:1,
    // and the prod nginx image is published on 3000 too), so the URL Vite
    // prints is always the URL that actually works in the browser.
    port: 3000,
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
