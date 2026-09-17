import type { Config } from "@react-router/dev/config";

export default {
  // Render en el servidor: las fichas tienen que llegar con título, precio y
  // metadatos en el HTML para Google y para la vista previa de WhatsApp.
  ssr: true,
} satisfies Config;
