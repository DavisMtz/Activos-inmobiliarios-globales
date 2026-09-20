# Activos Inmobiliarios Globales · sitio nuevo y panel

Propuesta funcional del sitio nuevo de la inmobiliaria del papá de David (Morelia), para reemplazar el WordPress que manejan unos consultores. React + un solo Worker de Cloudflare + D1 + Cloudinary, con panel privado por roles.

## Antes de tocar nada

0. **Si vienes a continuar el trabajo, `TRASPASO.md` primero:** qué hay en producción, qué quedó pendiente, cómo se verifica y las reglas que aquí ya costaron algo. Es corto; lo que sigue es la referencia completa.
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
- **No** tocar DNS, dominio ni correo del sitio real y **no** instalar hooks de auto-push sin que el usuario lo pida.
- **Repositorio:** `github.com/DavisMtz/Activos-inmobiliarios-globales`, rama `main`, **PÚBLICO**. Se sube a mano, con `git push`, al cerrar cada paso verificado. Por ser público: ni claves, ni `.dev.vars`, ni contraseñas temporales, ni datos de prospectos reales en ningún archivo versionado.
- Textos de la interfaz en español de México, con acentos correctos. Nombres de código en español, como en los demás proyectos del usuario.
- **Desplegar (y el `git push`, si no se pidió) necesita la palabra explícita del usuario en la conversación**, y vale para esa tarea, no para la siguiente. Antes de cualquier deploy: `git worktree list`, `git branch -a` y `npx wrangler deployments list` (PLAN §17: otra sesión puede estar desplegando desde un worktree).
- **Al cerrar una fase:** verificar contra la app corriendo y anotar los resultados reales en `PLAN.md` §19. **Al cerrar una sesión, actualizar `TRASPASO.md`.**
