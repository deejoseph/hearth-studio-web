import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/hearth_admin/',

  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      manifest: {
        name: 'Hearth Studio Admin',
        short_name: 'HearthAdmin',
        description: 'Hearth Studio Management System',
        theme_color: '#111111',
        background_color: '#111111',
        display: 'standalone',
        start_url: '/hearth_admin/',
        icons: [
          {
            src: '/hearth_admin/pwa-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/hearth_admin/pwa-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})