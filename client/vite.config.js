import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.CITYCART_API_PROXY_TARGET || 'http://localhost:5000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Long-lived framework chunks stay cached between deploys. Leaflet,
        // Recharts and the dashboard code are already behind dynamic imports,
        // so they are deliberately not grouped here.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//,
            },
            { name: 'motion', test: /node_modules\/framer-motion\// },
            { name: 'icons', test: /node_modules\/lucide-react\// },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/v1': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
