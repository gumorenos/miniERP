# OpenClaw — QA y deploy de miniERP

OpenClaw se utiliza únicamente para QA, backup y despliegue. No debe modificar código, crear commits, integrar el runtime ni actuar como puente de Telegram o WhatsApp.

## Prompt canónico

Enviar por Telegram o Discord. El texto tiene menos de 2000 caracteres:

```text
QA + DEPLOY CONDICIONADO — miniERP

Repo: gumorenos/miniERP
Rama: qa/miniERP-telegram-entity-resolution
SHA EXACTO: 291aeb1eab75a2222c0bf577d45b3dbcd4f60953
Producción actual: 022703566033fb8c8fec13314985631951f2e938
URL: https://prueba.gumorenos.space
VPS: /home/ubuntu/apps/minierp-samiiwara

OpenClaw solo hace QA, backup y deploy; no modifica código ni forma parte del runtime. Verifica que el SHA exista y haz checkout detached exacto. Si falla: STOP. No uses HEAD, otro SHA ni fallback.

En entornos aislados ejecuta: npm ci, npm run qa, migraciones 0001–0016 desde cero e idempotentes, E2E, concurrencia/idempotencia y docker build.

Comprueba Telegram y la UI interna “Capturar por chat”: cliente desconocido -> “Crear clienta”; producto desconocido -> hasta 3 similares y “Crear producto”; seleccionar/crear actualiza el mismo draftId y conversationKey; crear producto exige precio explícito, queda OTHER y la orden sigue requiriendo Confirmar; respuestas aisladas de talla (M/L/XL) completan el mismo borrador; `cliente: Ana quiere...` separa clienta y pedido; replay/concurrencia no duplica; callbacks <64 caracteres, usuario 59414146 autorizado; talla S no preseleccionada; stock negativo, regresiones y OpenClaw ausente del runtime.

Verifica las seis variables Telegram en .env.production sin imprimir valores. Si falla un gate: NO despliegues. Si todo pasa: backup, deploy exacto, migraciones, health local/público y smoke autenticado. Usa datos sintéticos; no confirmes operaciones reales. Si deploy/smoke falla, rollback y health.

Reporta breve: PASS/FAIL, SHA exacto, QA, botones/resolución, Telegram simulado, deploy, smoke, rollback y bloqueo. Sin secretos, cookies ni tokens.
```

## Criterio de identificación

El SHA que debe probarse es `291aeb1eab75a2222c0bf577d45b3dbcd4f60953`. La rama puede tener commits posteriores solo de documentación; eso no autoriza a usar su HEAD como sustituto.
