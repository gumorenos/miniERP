# Prompt compacto para OpenClaw

Enviar por Telegram:

```text
CONTEXTO: miniERP/Samiiwara. OpenClaw solo ejecuta QA, backup y deploy; no desarrolla ni modifica código.

CANDIDATO EXACTO
Repo: gumorenos/miniERP
Rama: qa/miniERP-auth-cookie-fix-v2
SHA: b6b51b0bc637e1b8504c0964c985f37ab96f67d0
Producción actual: de5d3f6f5f088421fee8f3030652808076965656
URL: https://prueba.gumorenos.space

CAUSA RAÍZ DEL BLOQUEO
La producción actual es legacy: devuelve token Bearer y NO emite cookie. El candidato nuevo introduce minierp_session. Por eso es incorrecto exigir AUTH_SMOKE_PASS con cookie contra producción ANTES del deploy.

FLUJO
1. Fetch de la rama, verifica que el SHA exista/sea ancestro, checkout detached exacto. Si falla: STOP sin fallback.
2. QA aislado completo: npm ci, npm run qa, migraciones desde cero y sobre copia, E2E, concurrencia/idempotencia, stock negativo, Telegram simulado y docker build.
3. Arranca EXACTAMENTE el candidato en un entorno aislado con PostgreSQL QA o copia productiva. Ejecuta npm run smoke:auth contra ESA instancia. Debe dar AUTH_SMOKE_PASS y comprobar cookie HttpOnly + sesión + bootstrap. Si falla: STOP.
4. En producción antigua solo verifica health y, si corresponde, login legacy HTTP 200; NO exijas Set-Cookie porque ese SHA todavía no la implementa.
5. Solo con QA y smoke cookie del candidato en PASS: backup PostgreSQL, etiqueta rollback, despliega exactamente el SHA indicado y aplica migraciones.
6. Después del deploy ejecuta npm run smoke:auth contra producción HTTPS. Ahora SÍ exige AUTH_SMOKE_PASS con cookie; si falla, rollback inmediato.
7. Reporta PASS/FAIL, SHA, QA, auth QA, auth prod post-deploy, backup, rollback, health y bloqueos. Nunca reveles credenciales, cookies o tokens.
```
