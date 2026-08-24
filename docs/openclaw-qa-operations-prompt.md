# Prompt OpenClaw — captura conversacional multi-turno

Enviar por Telegram. El SHA ya fue publicado y verificado antes de enviar este prompt.

```text
QA + DEPLOY CONDICIONADO — miniERP

Contexto: miniERP es el ERP de Samiiwara. Producción está sana en b6b51b0 (no la uses para pruebas). OpenClaw solo hace QA, backup y deploy; no debe integrarse al runtime ni tocar Telegram/WhatsApp funcional.

Repo: gumorenos/miniERP
Rama QA: qa/miniERP-conversation-multiturn
SHA exacto candidato: 6e74797d86d58473fbd67269e3074c9c6d7bb368
Producción: https://prueba.gumorenos.space
VPS: /home/ubuntu/apps/minierp-samiiwara

1) Verifica el SHA exacto con fetch, cat-file y checkout detached. Si no existe o no coincide, STOP. No uses otro SHA, HEAD ni la cabeza de la rama como fallback.
2) En worktree y PostgreSQL aislados ejecuta npm ci, npm run qa, migraciones desde cero e idempotentes sobre copia, test:e2e y docker build.
3) Verifica migración 0016: conversation_key, capture_draft_messages y backfill de mensajes históricos.
4) Prueba multi-turno en Telegram simulado y UI interna: mensaje incompleto -> respuesta posterior -> mismo draftId -> preguntas/botones correctos -> confirmación. Verifica que la UI no preseleccione talla S cuando falta. Repite ambos mensajes y confirma que no duplica borrador ni operación. Prueba dos respuestas concurrentes y confirmación concurrente.
5) Verifica callbacks Telegram simulados, stock negativo, transacciones/idempotencia existentes y ausencia de referencias/dependencia de OpenClaw en src/runtime.
6) Si falla cualquier gate: NO despliegues. Reporta FAIL, SHA, comando y error.
7) Solo si todo pasa: backup PostgreSQL, despliega EXACTAMENTE el SHA candidato, aplica migraciones, health local/público y smoke autenticado. Si faltan credenciales reales, no inventes: detén el deploy y reporta el bloqueo.
8) Si deploy/smoke falla: rollback controlado a la imagen/commit anterior, verifica health y reporta backup, rollback y producción final.

Respuesta corta: PASS/FAIL, SHA, pruebas, migraciones, multi-turno, deploy sí/no, smoke, rollback y bloqueos. No incluyas secretos, cookies ni tokens.
```
