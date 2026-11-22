import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      workbox: {
  globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp}'],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  // Without this every navigation the precache doesn't recognise is answered
  // from the cached root index.html, which swallows /chess/ (a separate static
  // build that lives outside this dist).
  navigateFallbackDenylist: [/^\/chess(\/|$)/],
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.destination === 'image',
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 200,
        },
      },
    },
  ],
},
      manifest: {
        name: "iChessGeek",
        short_name: "iChessGeek",
        description: "普通家庭的技术之路",
        theme_color: "#000000",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['hs.ichessgeek.com'],
    proxy: {
      "/api": {
        target: "https://ichessgeek.com",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});