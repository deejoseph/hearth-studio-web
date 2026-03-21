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
        name: "Hearth Studio",
        short_name: "Hearth",
        description: "Handcrafted Ceramic Studio",
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

  // 👇 保留你的代理
  server: {
    proxy: {
      "/api": {
        target: "https://ichessgeek.com",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});