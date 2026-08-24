# OpenClaw — estado operativo miniERP

## Deploy vigente

El SHA `b6b51b0bc637e1b8504c0964c985f37ab96f67d0` ya fue desplegado correctamente en miniERP/Samiiwara.

- QA: PASS, 51/51 tests, 0 vulnerabilidades, lint/typecheck/build.
- Migraciones: 15/15 desde cero, idempotentes y productivas.
- E2E, concurrencia, idempotencia, stock negativo y Telegram simulado: PASS.
- Smoke aislado y HTTPS post-deploy: `AUTH_SMOKE_PASS`.
- Health local y externo: HTTP 200.
- Backup: `/home/ubuntu/apps/minierp-samiiwara/backups/minierp-prod-before-b6b51b0-20260823-2359.dump`.
- Rollback tag: `rollback/minierp-prod-de5d3f6-20260823-2359`.
- Rollback: no requerido.

No ejecutes nuevamente el deploy de b6. Para una siguiente release, ChatGPT debe publicar un nuevo SHA y entregar un prompt nuevo con contexto mínimo, verificación exacta, QA, backup, rollback y deploy condicionado.

## Límites

OpenClaw solo ejecuta QA, backups y deploy. No modifica código, no hace commits y no se integra al runtime. No reporta credenciales, cookies ni tokens.

## Pendiente

- Telegram real: secretos privados, webhook HTTPS, mensaje/borrador/confirmación/rechazo/callbacks e idempotencia.
- Conversación multi-turno: vincular respuestas posteriores con borradores pendientes sin duplicar registros.
- WhatsApp oficial después de confirmar contacto y proveedor/API.
