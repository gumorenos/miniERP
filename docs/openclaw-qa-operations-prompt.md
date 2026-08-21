# Prompt OpenClaw — hardening miniERP

Enviar por Telegram:

```text
QA + DEPLOY CONDICIONADO — miniERP

Repo: gumorenos/miniERP
Rama: codex/capture-operational-confirmation
SHA exacto: 8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0
Producción actual: de5d3f6f5f088421fee8f3030652808076965656
URL: https://prueba.gumorenos.space
VPS: /home/ubuntu/apps/minierp-samiiwara

OpenClaw solo hace QA, backup y deploy. No cambies código, no hagas commits/merge/fixes y no integres OpenClaw al runtime. No uses producción para probar.

1. Verifica que el SHA exacto exista:
git fetch origin refs/heads/codex/capture-operational-confirmation
git cat-file -t 8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0
git merge-base --is-ancestor 8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0 FETCH_HEAD
Si falla cualquiera: STOP. No uses otro SHA ni el HEAD como fallback.

2. En worktree y PostgreSQL aislados ejecuta:
npm ci
npm run qa
migraciones desde cero y sobre copia de producción
npm run test:e2e
docker build

3. Verifica:
- confirmación transaccional NEW_PURCHASE, NEW_EXPENSE y STOCK_ADJUSTMENT
- idempotencia/concurrencia de esos borradores
- stock negativo bajo concurrencia
- corte concurrente e idempotente, sin doble consumo de tela
- envío/recepción concurrente de bordado, sin estados/historial huérfanos
- ensamblaje y ready-delivery concurrentes, sin doble consumo
- ajustes manuales y edición/anulación de compras bajo concurrencia
- rollback si falla una operación intermedia
- callbacks Telegram simulados
- sesión web por cookie HttpOnly, sin token en localStorage
- headers CSP/HSTS/Permissions-Policy
- Telegram rechaza usuarios fuera de TELEGRAM_ALLOWED_USER_IDS
- OpenClaw no está conectado al runtime

4. Si falla cualquier gate: NO despliegues. Reporta FAIL, SHA, comando y error.

5. Solo si todo pasa:
- crea backup PostgreSQL
- etiqueta imagen actual para rollback
- despliega EXACTAMENTE el SHA 8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0
- aplica migraciones
- verifica healthy y /api/health=200
- ejecuta smoke autenticado y no autenticado
- si Telegram no tiene credenciales reales, reporta no probado; no inventes secretos

6. Si deploy/smoke falla, revierte de forma controlada usando backup/imagen y reporta los identificadores.

Respuesta breve: PASS/FAIL, SHA, tests, migraciones, concurrencia, Docker, deploy, smoke y bloqueos.
```
