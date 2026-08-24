# Prompt compacto para OpenClaw

Enviar por Telegram:

```text
CONTEXTO — miniERP / Samiiwara

Esta tarea continúa el desarrollo del miniERP de Samiiwara. OpenClaw NO desarrolla ni modifica código: solo valida QA, hace backup y despliega si los gates pasan. No integres OpenClaw al runtime.

OBJETIVO ACTUAL

Validar y, solo si todo está correcto, desplegar el candidato que corrige concurrencia, stock, sesiones web, headers de seguridad y autorización Telegram. El bloqueo anterior fue el smoke autenticado de producción porque APP_USER_PASSWORD estaba vacío.

CANDIDATO EXACTO

Repo: gumorenos/miniERP
Rama QA dedicada (HEAD fijado): qa/miniERP-auth-cookie-fix-a92
SHA: a92ac8d3efbdc8fef7ba3ea727078a996b775dca
Producción actual: de5d3f6f5f088421fee8f3030652808076965656
URL: https://prueba.gumorenos.space
VPS: /home/ubuntu/apps/minierp-samiiwara

REGLAS

- Haz fetch explícito de la rama QA: git fetch origin refs/heads/qa/miniERP-auth-cookie-fix-a92:refs/remotes/origin/qa/miniERP-auth-cookie-fix-a92
- Verifica que refs/remotes/origin/qa/miniERP-auth-cookie-fix-a92 resuelva exactamente a a92ac8d3efbdc8fef7ba3ea727078a996b775dca.
- Verifica exactamente el SHA; si no existe, STOP.
- No uses otro SHA ni el HEAD como fallback.
- No cambies código, no hagas commits ni fixes.
- No uses producción para pruebas.
- No muestres, envíes ni guardes contraseñas o tokens en el reporte.

FLUJO

1. Ejecuta git fetch origin refs/heads/qa/miniERP-auth-cookie-fix-a92:refs/remotes/origin/qa/miniERP-auth-cookie-fix-a92; verifica git rev-parse refs/remotes/origin/qa/miniERP-auth-cookie-fix-a92 = a92ac8d3efbdc8fef7ba3ea727078a996b775dca; haz checkout detached del SHA exacto y confirma git rev-parse HEAD = a92ac8d3efbdc8fef7ba3ea727078a996b775dca.
2. En worktree y PostgreSQL aislados ejecuta npm ci, npm run qa, migraciones desde cero y sobre copia, test:e2e, concurrencia/idempotencia y docker build.
3. Ejecuta npm run smoke:auth contra producción usando una cuenta piloto válida disponible directamente en el VPS.
4. Si APP_USER_PASSWORD no está configurado, devuelve AUTH_SMOKE_BLOCKED y detente. No inventes valores ni despliegues.
5. Si cualquier gate falla, NO despliegues.
6. Solo si todos pasan: backup PostgreSQL, etiqueta rollback, despliega EXACTAMENTE el SHA indicado, aplica migraciones, verifica health y ejecuta smoke autenticado/no autenticado.
7. Si deploy o smoke falla, rollback controlado y reporta resultado.

RESPUESTA

PASS/FAIL, SHA, QA, migraciones, concurrencia, auth smoke, Docker, deploy, health, rollback y bloqueos.
```
