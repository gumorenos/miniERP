# Prompt OpenClaw — operaciones conversacionales

Enviar por Telegram:

```text
QA + DEPLOY CONDICIONADO — miniERP

Repo: gumorenos/miniERP
Rama: codex/capture-operational-confirmation
SHA exacto: 8cfa285cf0a080a3c29b5d7190121024e1b4f9b3
Producción: https://prueba.gumorenos.space
VPS: /home/ubuntu/apps/minierp-samiiwara

OpenClaw solo hace QA y deploy. No cambies código, no hagas commits, merge ni fixes. No uses producción para probar.

1. Verifica con git ls-remote que el SHA exacto existe. Si no existe: STOP. No uses otro SHA ni la cabeza de la rama como fallback.
2. En worktree y PostgreSQL aislados ejecuta npm ci, npm run qa, migraciones desde cero y sobre copia, npm run test:e2e y docker build.
3. Verifica especialmente NEW_PURCHASE, NEW_EXPENSE y STOCK_ADJUSTMENT: borrador, confirmación humana, migración 0015, transacción atómica, una sola operación ante confirmaciones concurrentes y rechazo de stock negativo.
4. Verifica callbacks Telegram simulados y que OpenClaw no esté conectado al runtime funcional.
5. Si falla cualquier gate: NO despliegues. Reporta FAIL, SHA, comando y error.
6. Solo si todo pasa: backup PostgreSQL, despliega EXACTAMENTE ese SHA, aplica migraciones, espera healthcheck y ejecuta smoke. Si Telegram no tiene credenciales, reporta no probado; no inventes secretos.
7. Si deploy/smoke falla: rollback identificable y reporta backup, imagen/commit previo y resultado.

Respuesta breve: PASS/FAIL, SHA, pruebas, migraciones, deploy sí/no, smoke y bloqueos.
```
