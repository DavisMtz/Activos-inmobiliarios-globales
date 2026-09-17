import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // El Worker entero (Hono + React Router) corre en el entorno «ssr» de Vite:
    // en desarrollo es el mismo workerd que en producción, con D1 y los
    // limitadores locales en .wrangler/state.
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
  ],
  server: {
    // 5173 suele estar ocupado por otros proyectos de esta máquina (un, Cuponera).
    port: 5180,
    strictPort: true,
  },
});
