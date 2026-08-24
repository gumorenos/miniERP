# Prompt compacto para OpenClaw

```text
QA + DEPLOY — miniERP

Contexto: Samiiwara miniERP. Producción sigue en b6b51b0 y está sana. Este candidato añade captura conversacional multi-turno y migración 0016. OpenClaw solo hace QA/deploy; no integra runtime, Telegram ni WhatsApp.

Repo gumorenos/miniERP
Rama qa/miniERP-conversation-multiturn
SHA EXACTO 6e74797d86d58473fbd67269e3074c9c6d7bb368
URL https://prueba.gumorenos.space

Verifica existencia, checkout detached y SHA exacto. Si falla: STOP, sin usar HEAD/otro SHA.
En worktree aislado ejecuta npm ci, npm run qa, migraciones 0001-0016 desde cero y sobre copia, E2E, concurrencia/idempotencia, flujo multi-turno en API/UI con replay y confirmación, Telegram simulado y docker build. Confirma que OpenClaw no aparece en runtime.

Si algún gate falla: NO deploy; reporta comando/error. Solo si todo pasa: backup, deploy EXACTO del SHA, migraciones, health local/público y smoke autenticado. Sin credenciales: no inventes y detén deploy. Si deploy/smoke falla, rollback y reporta resultado. Nunca envíes secretos/cookies/tokens.

Respuesta: PASS/FAIL, SHA, QA, migraciones, multi-turno, deploy, smoke, rollback y bloqueos.
```
