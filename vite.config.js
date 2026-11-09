import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  server: {
    // En local, /api va al studio-server (npm start en src/studio-server, puerto 8787)
    proxy: { '/api': 'http://localhost:8787' },
  },
})
