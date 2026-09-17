import { defineConfig } from "vitest/config";

// Aparte de vite.config.ts a propósito: las pruebas son de funciones puras y
// no necesitan levantar el plugin de Cloudflare ni React Router.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
