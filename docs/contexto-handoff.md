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
- Candidato de QA actualmente validado para reintentar auth smoke: `a92ac8d3efbdc8fef7ba3ea727078a996b775dca`.
- Rama QA dedicada: `qa/miniERP-auth-cookie-fix-a92`.
- El candidato a92 corrigió el harness de auth para leer `Set-Cookie` con headers HTTP nativos. OpenClaw debe verificar explícitamente el HEAD de esa rama y detenerse si no coincide.

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

1. Esperar el resultado de OpenClaw sobre `a92ac8d3efbdc8fef7ba3ea727078a996b775dca`; si pasa auth smoke, que despliegue según el prompt.
2. Ejecutar revisión/QA del nuevo candidato de seguimiento conversacional antes de desplegarlo.
3. Después implementar conversación multi-turno real: asociar una respuesta posterior al borrador pendiente correcto, reparsear/mezclar datos y volver a mostrar confirmación sin duplicar registros.
4. Luego configurar Telegram real con secretos privados y prueba sintética; WhatsApp queda para cuando exista contacto y proveedor.

## Estado de OpenClaw

OpenClaw no es parte de la aplicación. Si reporta un SHA inexistente, cookie ausente, AUTH_* distinto de PASS o cualquier gate fallido, no debe hacer deploy ni usar otro SHA como sustituto.
