# Prompt compacto para OpenClaw

Candidato de código para QA: `8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0`. Producción actual: `de5d3f6f5f088421fee8f3030652808076965656`. OpenClaw solo hace QA, backup y deploy; no modifica código ni forma parte del runtime.

```text
QA + DEPLOY CONDICIONADO — miniERP

Repo: gumorenos/miniERP
Rama: codex/capture-operational-confirmation
SHA exacto: 8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0
Producción: https://prueba.gumorenos.space
VPS: /home/ubuntu/apps/minierp-samiiwara

No cambies código, no hagas commits/merge/fixes y no integres OpenClaw al runtime. No uses producción para probar.

1) Verifica:
git fetch origin refs/heads/codex/capture-operational-confirmation
git cat-file -t 8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0
git merge-base --is-ancestor 8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0 FETCH_HEAD
Si falla algo: STOP; no uses otro SHA ni el HEAD como fallback. Haz checkout detached del SHA exacto.

2) En worktree y PostgreSQL aislados ejecuta npm ci, npm run qa, migraciones desde cero y sobre copia, npm run test:e2e y docker build.

3) Verifica concurrencia/idempotencia y rollback de NEW_PURCHASE, NEW_EXPENSE, STOCK_ADJUSTMENT, corte, bordado, ensamblaje, ready-delivery, ajustes manuales y compras. Confirma que no haya stock negativo ni doble consumo. Verifica callbacks Telegram simulados, cookies HttpOnly sin token en localStorage, CSP/HSTS/Permissions-Policy, rechazo de usuarios Telegram fuera de TELEGRAM_ALLOWED_USER_IDS y ausencia de integración runtime con OpenClaw.

4) Si algún gate falla: NO despliegues. Reporta FAIL, SHA, comando y error.

5) Solo si todo pasa: crea backup PostgreSQL, etiqueta rollback, despliega EXACTAMENTE 8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0, aplica migraciones, verifica healthy y /api/health=200 y ejecuta smoke autenticado/no autenticado. Si Telegram no tiene secretos reales, reporta no probado; no inventes credenciales.

6) Si deploy/smoke falla, revierte de forma controlada y reporta backup, imagen/commit previo y resultado.

Respuesta breve: PASS/FAIL, SHA, pruebas, migraciones, concurrencia, Docker, deploy, smoke y bloqueos.
```
