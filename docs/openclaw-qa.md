# OpenClaw — QA y deploy de miniERP

OpenClaw se utiliza únicamente para QA, backup y despliegue. No debe modificar código, crear commits, integrar el runtime ni actuar como puente de Telegram o WhatsApp.

## Prompt canónico

Enviar por Telegram:

```text
QA + DEPLOY CONDICIONADO — miniERP

Contexto: miniERP es el ERP de Samiiwara. Producción está sana en eb455839c42ef0b6e411edfc4f356dae3fe00b1d (no usarla para pruebas). OpenClaw solo hace QA, backup y deploy; no se integra al runtime ni a Telegram/WhatsApp funcional.

Repo: gumorenos/miniERP
Rama QA: qa/miniERP-conversation-multiturn
SHA exacto candidato: f0a01b53f427da5709ea55989a82fdec079bb791
Producción: https://prueba.gumorenos.space
VPS: /home/ubuntu/apps/minierp-samiiwara

1) Verifica el SHA exacto con fetch, cat-file y checkout detached. Si no existe o no coincide: STOP. No uses otro SHA, HEAD ni la cabeza de la rama como fallback.
2) En worktree y PostgreSQL aislados ejecuta npm ci, npm run qa, migraciones desde cero e idempotentes sobre copia, test:e2e y docker build. Verifica además que compose.prod.yml transmita TELEGRAM_ALLOWED_USER_IDS al servicio app.
3) Verifica migración 0016: conversation_key, capture_draft_messages y backfill de mensajes históricos.
4) Prueba multi-turno en Telegram simulado y UI interna: mensaje incompleto, respuesta posterior, mismo draftId, preguntas/botones correctos y confirmación. Verifica que la UI no preseleccione talla S cuando falta. Repite mensajes y confirma que no duplica borrador ni operación. Prueba respuestas y confirmaciones concurrentes.
5) Verifica callbacks Telegram simulados, stock negativo, transacciones/idempotencia existentes y ausencia de referencias o dependencia de OpenClaw en src/runtime.
6) Si falla cualquier gate: NO despliegues. Reporta FAIL, SHA, comando y error.
7) Solo si todo pasa: backup PostgreSQL, despliega EXACTAMENTE el SHA candidato, aplica migraciones, health local/público y smoke autenticado. Si faltan credenciales reales, no inventes: detén el deploy y reporta el bloqueo.
8) Si deploy/smoke falla: rollback controlado a la imagen/commit anterior, verifica health y reporta backup, rollback y producción final.

Respuesta breve: PASS/FAIL, SHA, QA, migraciones, multi-turno, deploy sí/no, smoke, rollback y bloqueos. No incluyas secretos, cookies ni tokens.
```

## Criterio de identificación

El SHA que debe probarse es `f0a01b53f427da5709ea55989a82fdec079bb791`. La rama puede tener commits posteriores solo de documentación; eso no autoriza a usar su HEAD como sustituto.
