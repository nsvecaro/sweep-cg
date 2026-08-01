import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { devRoomApi } from './src/server/devServer'

export default defineConfig({
  plugins: [react(), devRoomApi()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The fuzz driver plays thousands of hands; it needs room when the suite
    // runs its files in parallel.
    testTimeout: 60_000,
  },
})
