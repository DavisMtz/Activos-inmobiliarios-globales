# Activos Inmobiliarios Globales · sitio nuevo y panel

Propuesta funcional del sitio nuevo de la inmobiliaria del papá de David (Morelia), para reemplazar el WordPress que manejan unos consultores. React + un solo Worker de Cloudflare + D1 + Cloudinary, con panel privado por roles.

## Antes de tocar nada

1. **`PLAN.md`** es la guía de construcción: decisiones, esquema de D1, autenticación, roles, rutas, fases con «listo cuando» y trampas del entorno. **Léelo completo.**
2. `analisis/ANALISIS.md` explica el sitio actual y el porqué de cada decisión. Si contradice a `PLAN.md`, **manda `PLAN.md`**.
3. `PARA-MI-PAPA.md` y `PEDIR-A-CONSULTORES.md` son documentos para personas; no son especificación.

## Reglas del proyecto

- La app vive en `sitio/`. `analisis/crudo/` son datos de origen: **solo lectura** (salvo crear `analisis/crudo/fichas/`, como indica el plan §14).
- **Decisiones cerradas** (PLAN §2): D1 como base de datos, correo y contraseña (no Access), maestro `davismartinesad@gmail.com`, contraseña temporal obligatoria de cambiar, roles maestro/director/asesor/contenido. No reabrirlas sin preguntar.
- **No inventar contenido del negocio** (testimonios, cifras, textos legales definitivos). Lo que falte se oculta o se marca «pendiente».
- **Nada del negocio en el código:** teléfonos, dirección, textos y redes van en la tabla `configuracion`; lo técnico en `server/config.ts`.
- **Permisos en un solo archivo** (`sitio/shared/permisos.ts`), aplicados en el servidor.
- `MODO_DEMO=1` hasta que el usuario pida salir a producción: `noindex`, sin correos y sin analítica real.
- **No** tocar DNS, dominio ni correo del sitio real, **no** crear repos remotos y **no** instalar hooks de auto-push sin que el usuario lo pida.
- Textos de la interfaz en español de México, con acentos correctos. Nombres de código en español, como en los demás proyectos del usuario.
- **Al cerrar una fase:** verificar contra la app corriendo y anotar los resultados reales en `PLAN.md` §19.
