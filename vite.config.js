import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // Run tests serially. Default parallel pool starves userEvent timers
    // under 500+ test load and causes intermittent failures that look like
    // logic bugs (typing taking 5s+, queryByX not finding rendered nodes).
    // Serial is ~3x slower but reliably green.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
})
