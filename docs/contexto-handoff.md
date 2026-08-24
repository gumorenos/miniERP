# Contexto de continuidad — miniERP / Samiiwara

Última actualización: 2026-08-24

## Proyecto y límites

- Repositorio: `gumorenos/miniERP`.
- Producción: `https://prueba.gumorenos.space`.
- OpenClaw se usa únicamente como agente externo de testing/QA, backup y despliegue condicionado. No se integra al runtime, webhook ni lógica de negocio.
- No inventar credenciales ni enviarlas por Telegram. Las credenciales productivas se gestionan directamente en el VPS o gestor de contraseñas.
- Si un SHA no existe o un gate falla, OpenClaw debe detenerse y no usar otro SHA como sustituto.

## Estado productivo

- Producción permanece en `de5d3f6f5f088421fee8f3030652808076965656`.
- El último deploy PASS confirmado por OpenClaw fue sobre ese SHA.
- El último intento de deploy posterior quedó bloqueado por el smoke autenticado; no se aplicaron migraciones ni se alteró producción.
- OpenClaw no debe tocar producción hasta terminar todos los gates del candidato exacto.

## Candidato de QA de autenticación

- SHA exacto: `a92ac8d3efbdc8fef7ba3ea727078a996b775dca`.
- Rama QA dedicada: `qa/miniERP-auth-cookie-fix-a92`.
- Esta rama debe verificarse con fetch explícito y `git rev-parse`; no usar el HEAD de otra rama como fallback.
- El candidato contiene el harness de smoke autenticado corregido para leer `Set-Cookie` mediante headers HTTP nativos.
- OpenClaw debe ejecutar QA aislado, migraciones, E2E, concurrencia, Docker y smoke auth. Solo con PASS completo puede hacer backup, migraciones y deploy exacto de a92.

## Trabajo desarrollado después del candidato a92

Se publicó un candidato posterior en la rama QA dedicada:

- Rama: `qa/miniERP-conversational-followup`.
- HEAD actual de la rama QA: `c432b8a6252d642021a1c8227c4b80cdad219cc3`.
- El código de la mejora está en el commit padre `15a4a6030e09e122c39644ee19dbe941534887dd`; `c432…` solo actualiza el roadmap.
- Este candidato todavía no está desplegado ni aprobado por OpenClaw.

Cambios:

- Etiquetas internas de captura convertidas a español legible.
- Preguntas concretas para campos faltantes o ambiguos, con ejemplos de talla, fecha y cantidad.
- Hasta tres preguntas agrupadas para que la usuaria responda en un solo mensaje.
- Cualquier ambigüedad, incluida la fecha de entrega, bloquea el botón de confirmación.
- La lógica de seguimiento está en el dominio de captura y puede reutilizarse desde Telegram y un futuro adaptador WhatsApp.
- No se añadió dependencia de OpenClaw, Telegram real ni WhatsApp.

Validación local del candidato 15a4:

- ESLint: PASS.
- TypeScript: PASS.
- Vitest: PASS, 50/50 pruebas en 12 archivos.
- Vite build: PASS.
- PostgreSQL aislado, Docker, migraciones productivas y deploy: pendientes de OpenClaw.

## Funcionalidad siguiente

El próximo incremento real después de aprobar este candidato es conversación multi-turno:

1. Detectar la respuesta posterior de la usuaria.
2. Asociarla al borrador pendiente correcto dentro del mismo canal/chat/usuario.
3. Reparsear y mezclar únicamente los campos faltantes o ambiguos.
4. Mostrar el borrador actualizado.
5. Mantener confirmación humana, idempotencia y protección contra duplicados.
6. Expirar o permitir descartar borradores abandonados.

Después: configurar Telegram real con secretos privados y prueba sintética; WhatsApp queda para cuando exista contacto y se elija proveedor/API.

## Documentación operativa

- `docs/roadmap.md`: mapa de funcionalidades y prioridades.
- `docs/qa-pendiente.md`: gates e histórico de QA/deploy.
- `docs/openclaw-qa-prompt.md`: prompt corto para Telegram.
- `docs/openclaw-qa-operations-prompt.md`: prompt detallado.
- `docs/telegram-capture.md`: contrato del webhook directo.
- `docs/authentication.md`: sesión y autenticación.
- Este archivo debe actualizarse al terminar cada tarea.

## Regla para continuar

Primero confirmar el SHA y la rama exacta con GitHub. No mezclar el QA de a92 con el candidato 15a4. No desplegar el seguimiento conversacional sin QA aislado completo y aprobación del SHA exacto.
