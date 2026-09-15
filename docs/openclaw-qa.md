# OpenClaw — QA y deploy de miniERP

OpenClaw solo hace QA, backup y despliegue. No modifica código ni forma parte del runtime. Telegram y WhatsApp conectan directamente con miniERP.

## Prompt canónico WhatsApp

El siguiente mensaje tiene menos de 2000 caracteres y puede enviarse por Discord:

```text
QA + DEPLOY + ACTIVACIÓN WHATSAPP — miniERP

Repo: gumorenos/miniERP
Rama: feat/miniERP-whatsapp-cloud-api
SHA EXACTO: f2a12ba197345f5f019b56d0bde98909eecebb28
Producción actual: 291aeb1eab75a2222c0bf577d45b3dbcd4f60953
URL: https://prueba.gumorenos.space
VPS: /home/ubuntu/apps/minierp-samiiwara

Verifica el SHA exacto y haz checkout detached. Si falla: STOP. No uses HEAD, otro SHA ni fallback.

En aislado ejecuta npm ci, npm run qa, migraciones 0001–0016 desde cero e idempotentes, E2E, concurrencia/idempotencia y docker build.

Comprueba WhatsApp Cloud API: GET de verificación; firma X-Hub-Signature-256; texto crea/completa el mismo draftId y conversationKey; botones hasta 3 y lista para más opciones; crear cliente/producto, similares, confirmación, rechazo y replay sin duplicados; allowlist de número; mensajes no soportados ignorados; Telegram y UI existentes sin regresiones; OpenClaw ausente del runtime.

Verifica sin imprimir valores: WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION, WHATSAPP_BUSINESS_ID, WHATSAPP_USER_ID y WHATSAPP_ALLOWED_PHONE_NUMBERS. Si falta algo, no actives WhatsApp ni inventes secretos.

Si todos los gates y credenciales pasan: backup, deploy EXACTO, migraciones, health local/público, smoke y prueba sintética de WhatsApp. No confirmes operaciones reales. Si falla deploy/smoke, rollback y verifica health.

Reporta PASS/FAIL, SHA, QA, WhatsApp, deploy, smoke, rollback y bloqueos. Sin secretos, cookies ni tokens.
```

El SHA funcional que debe probarse es `f2a12ba197345f5f019b56d0bde98909eecebb28`. No usar el HEAD de otra rama como sustituto.
