# Prompt OpenClaw — QA y deploy condicionado de miniERP

Enviar por Telegram:

```text
CONTEXTO DE LA TAREA

Estamos trabajando en miniERP/Samiiwara, una aplicación para gestionar un taller. Esta es una tarea de release validation posterior al code review. OpenClaw solo ejecuta QA, backup y deploy condicionado; ChatGPT desarrolla. No modifiques código, no hagas commits/fixes y no integres OpenClaw al runtime.

OBJETIVO

Validar y desplegar, solo con todos los gates en PASS, el candidato que incorpora:
- transacciones y locks contra doble consumo/stock negativo;
- idempotencia de operaciones;
- sesión web con cookie HttpOnly;
- CSP/HSTS/Permissions-Policy;
- autorización Telegram por chat y usuario;
- script diagnóstico `npm run smoke:auth` con lectura de cookie desde headers HTTP crudos, compatible entre runtimes.

CANDIDATO EXACTO

Repo: gumorenos/miniERP
Rama QA dedicada (HEAD fijado): qa/miniERP-auth-cookie-fix-a92
SHA exacto: a92ac8d3efbdc8fef7ba3ea727078a996b775dca
Producción actual: de5d3f6f5f088421fee8f3030652808076965656
URL: https://prueba.gumorenos.space
VPS: /home/ubuntu/apps/minierp-samiiwara

El intento anterior pasó QA pero no desplegó porque producción no tenía APP_USER_PASSWORD. Esa condición debe verificarse explícitamente; no debes inventar credenciales ni usar valores vacíos.

REGLAS DE SEGURIDAD

- Verifica el SHA exacto con fetch, cat-file y merge-base.
- Si falla: STOP, sin fallback a otro SHA o HEAD.
- Usa worktree y PostgreSQL aislados para QA.
- No uses producción para pruebas destructivas.
- No modifiques código, commits, ramas ni migraciones manualmente.
- No muestres contraseñas, tokens, cookies ni secretos en el reporte.
- OpenClaw no debe quedar conectado al runtime funcional.

QA AISLADO

Ejecuta:
- npm ci
- npm run qa
- migraciones desde cero
- migraciones sobre copia de producción
- npm run test:e2e
- concurrencia/idempotencia de compras, gastos, ajustes, corte, bordado, ensamblaje y ready-delivery
- rechazo de stock negativo
- callbacks Telegram simulados
- verificación de cookies HttpOnly, ausencia de token en localStorage y headers CSP/HSTS/Permissions-Policy
- docker build

SMOKE AUTENTICADO

Ejecuta `npm run smoke:auth` contra producción usando una cuenta piloto válida disponible directamente en el VPS.

Interpretación:
- AUTH_SMOKE_PASS: continúa.
- AUTH_SMOKE_BLOCKED: APP_USER_PASSWORD ausente; STOP y no despliegues.
- AUTH_PAYLOAD_INVALID: STOP y reporta.
- AUTH_CREDENTIALS_INVALID: STOP y reporta.
- AUTH_PASSWORD_CHANGE_REQUIRED: STOP y reporta.
- cualquier otro AUTH_*: STOP.

No envíes credenciales por Telegram ni las imprimas en el informe.

DEPLOY CONDICIONADO

Solo si QA, smoke auth y Docker pasan:
1. crea backup PostgreSQL;
2. etiqueta imagen/commit previo para rollback;
3. despliega EXACTAMENTE a92ac8d3efbdc8fef7ba3ea727078a996b775dca;
4. aplica migraciones;
5. verifica contenedores healthy, /api/health=200 y smoke autenticado/no autenticado;
6. si algo falla, ejecuta rollback controlado y reporta backup, imagen previa y estado final.

RESPUESTA BREVE

PASS/FAIL, SHA, QA, migraciones, concurrencia, auth smoke, Docker, deploy, health, rollback y bloqueos.
```
