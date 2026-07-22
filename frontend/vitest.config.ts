import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so the app's build/dev config (Tailwind
// plugin, dev-server proxy) stays untouched: tests only need the React
// plugin for JSX plus a jsdom DOM.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Exclude entry points, type-only and heavy realtime modules the
      // first suite doesn't cover, so the ratio reflects tested code.
      exclude: [
        'src/main.tsx',
        'src/**/*.test.{ts,tsx}',
        'src/services/voiceCall.ts',
        'src/services/voice.ts',
      ],
    },
  },
})
