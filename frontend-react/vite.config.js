import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
  server: {
    port: 3000,
    host: true,
    allowedHosts: ['luxquant.tw'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true
      }
    }
  },

  build: {
    // Target modern browsers for smaller output
    target: 'es2020',
    
    // Enable source maps for debugging (optional, remove for smaller builds)
    sourcemap: false,
    
    // Increase chunk warning limit (recharts is big)
    chunkSizeWarningLimit: 600,
    
    // CSS code splitting
    cssCodeSplit: true,
    
    // Minification
    minify: 'esbuild',
    
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal caching
        manualChunks: {
          // React core — changes rarely, cached long-term
          'vendor-react': ['react', 'react-dom'],
          
          // Router — separate from react core
          'vendor-router': ['react-router-dom'],
          
          // Charting libs — large, only needed in terminal
          'vendor-charts': ['recharts', 'lightweight-charts'],
          
          // i18n — loaded on every page but separate chunk
          'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          
          // Axios — used everywhere but small
          'vendor-axios': ['axios'],
        },
        
        // Cleaner chunk names
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Organize assets by type
          if (/\.(css)$/.test(assetInfo.name)) {
            return 'assets/css/[name]-[hash][extname]';
          }
          if (/\.(png|jpe?g|gif|svg|webp|ico)$/.test(assetInfo.name)) {
            return 'assets/img/[name]-[hash][extname]';
          }
          if (/\.(woff2?|eot|ttf|otf)$/.test(assetInfo.name)) {
            return 'assets/fonts/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
})