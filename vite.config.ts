
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/Vid-Trackr-v2/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
