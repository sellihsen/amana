import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Les dépendances stables sont isolées : elles changent rarement, et
        // restent donc en cache du navigateur entre deux déploiements, alors
        // que le code applicatif est réémis à chaque fois.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          graphiques: ['recharts'],
        },
      },
    },
    // Le seuil d'avertissement vise le morceau applicatif, désormais découpé.
    chunkSizeWarningLimit: 600,
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    css: false,
    restoreMocks: true,
    clearMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
})
