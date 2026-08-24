# Contexto de continuidad — miniERP / Samiiwara

Última actualización: 2026-08-24

## Reglas de trabajo

- ChatGPT desarrolla el producto.
- OpenClaw se usa únicamente para testing, QA, backups y deploy; no se integra al runtime.
- Todo prompt para OpenClaw debe incluir contexto mínimo, candidato exacto y regla de no usar fallbacks.
- No poner secretos en Telegram ni en este archivo.

## Producción y candidato QA

- Producción: `https://prueba.gumorenos.space`
- Producción sigue en `de5d3f6f5f088421fee8f3030652808076965656` hasta que OpenClaw confirme otro deploy.
- Candidato exacto para la próxima QA: `b6b51b0bc637e1b8504c0964c985f37ab96f67d0`.
- Rama QA dedicada: `qa/miniERP-auth-cookie-fix-v2`.
- Este candidato incluye la mejora conversacional y el refuerzo del smoke auth. OpenClaw debe verificar SHA y checkout detached exactos; no usar `a92…` ni otro fallback.

## Trabajo realizado en esta tarea

Se implementó la siguiente mejora, todavía no desplegada:

- La captura conversacional traduce campos internos a etiquetas legibles en español.
- Los borradores incompletos o ambiguos generan preguntas concretas y ejemplos para que la usuaria responda en un solo mensaje.
- Una fecha, cliente, producto o material ambiguo bloquea la confirmación hasta que se aclare.
- La lógica de seguimiento vive en el dominio de captura y puede reutilizarse desde Telegram o un futuro adaptador WhatsApp.
- No se agregó dependencia de OpenClaw, Telegram real ni WhatsApp.

Validación local de esta mejora:

- ESLint: PASS
- TypeScript: PASS
- Vitest: PASS, 50/50 pruebas
- Vite build: PASS

## Siguiente paso recomendado

1. Ejecutar OpenClaw sobre `b6b51b0bc637e1b8504c0964c985f37ab96f67d0`; si todos los gates y auth smoke pasan, desplegar exactamente ese SHA.
2. Después del deploy, validar Telegram real cuando existan secretos y autorización.
3. Después implementar conversación multi-turno real: asociar una respuesta posterior al borrador pendiente correcto, reparsear/mezclar datos y volver a mostrar confirmación sin duplicar registros.
4. Luego configurar Telegram real con secretos privados y prueba sintética; WhatsApp queda para cuando exista contacto y proveedor.

## Estado de OpenClaw

OpenClaw no es parte de la aplicación. Si reporta un SHA inexistente, cookie ausente, AUTH_* distinto de PASS o cualquier gate fallido, no debe hacer deploy ni usar otro SHA como sustituto.
\n\n## Diagnóstico del bloqueo AUTH_COOKIE_MISSING\n\nEl login fue aceptado pero OpenClaw no encontró `minierp_session`. No se usará el token JSON como sustituto, porque eso ocultaría un fallo real de sesión por cookie. El siguiente QA debe reportar si la cookie aparece en headers normales o en `rawHeaders`, sin revelar tokens.\n