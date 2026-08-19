# Prompt compacto para OpenClaw

Reemplazar `CANDIDATO_SHA` por el SHA exacto después de publicar el commit candidato. Si el SHA no existe en el remoto, detenerse: no usar `dddb892`, `main` ni otro commit como fallback.

```text
QA + DEPLOY CONDICIONADO — miniERP

Repo: gumorenos/miniERP
Rama: codex/telegram-direct-candidate
Candidato exacto: CANDIDATO_SHA
Producción: https://prueba.gumorenos.space
VPS: /home/ubuntu/apps/minierp-samiiwara

OpenClaw solo hará QA y despliegue. No cambies código, no hagas commits, merge ni fixes automáticos. No uses producción para pruebas.

1) Haz fetch y verifica que CANDIDATO_SHA existe. Si no existe, STOP y reporta. Checkout detached de ese SHA y confirma el SHA real.
2) En un worktree/base aislados ejecuta npm ci, npm run qa, migraciones desde cero, migraciones sobre copia, test:e2e, pruebas de concurrencia/idempotencia y docker build. Verifica headers, rate limit, captura, callbacks Telegram y que el endpoint legacy de OpenClaw no esté conectado.
3) Si algún gate falla, NO despliegues. Reporta FAIL, comando, error y SHA.
4) Solo si todo pasa: respalda PostgreSQL, despliega EXACTAMENTE CANDIDATO_SHA en la ruta indicada, aplica migraciones, espera healthchecks y ejecuta smoke de health/login. Si Telegram está configurado, prueba también el webhook; no inventes credenciales.
5) Si el deploy o smoke falla, detén tráfico nuevo y aplica rollback al commit/imagen anterior identificable. Reporta resultado, backup, SHA desplegado, health, smoke y rollback.

Respuesta final corta: PASS/FAIL, SHA probado, pruebas, base/migraciones, deploy sí/no, smoke y bloqueos.
```
