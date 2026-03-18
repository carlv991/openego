import { defineConfig } from 'vite'

export default defineConfig({
  root: './src',
  base: '',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: './src/index.html'
    }
  },
  css: {
    devSourcemap: true
  },
  server: {
    port: 1420,
    strictPort: true
  }
})
