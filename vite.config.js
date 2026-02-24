import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // 👇 新增这一段
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