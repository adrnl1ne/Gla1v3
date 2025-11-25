import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // Already in Dockerfile, but good to have here too
    port: 5173,
    // ← THIS IS THE MISSING LINE THAT FIXES THE ERROR
    allowedHosts: [
      'gla1v3.local',
      'dashboard.gla1v3.local',
      'api.gla1v3.local',
      'c2.gla1v3.local',
      'traefik.gla1v3.local',
      'wazuh.gla1v3.local'
    ]
  }
})