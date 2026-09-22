import { defineConfig } from "vite";

export default defineConfig({
  base: "/kyouen-game/",
  build: { target: "es2022", outDir: "dist", sourcemap: false },
  publicDir: "public",
  server: {
    port: 5173,
    proxy: {
      "^/kyouen-game/strategy/.*": {
        target: "http://127.0.0.1:8099",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/kyouen-game\/strategy/, ""),
      },
    },
  },
  test: undefined,
});
