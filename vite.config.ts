import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // IMPORTANT: Netlify needs root base path
  base: '/',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
