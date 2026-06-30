import { defineConfig } from 'vite'

export default defineConfig({
  base: '/crazy-royale/',
  server: {
    host: true,
    port: 5173,
    open: true
  }
})
