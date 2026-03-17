import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: '../server/public/admin',
    emptyOutDir: true
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5005",
        changeOrigin: true,
      },
    },
  },
})
