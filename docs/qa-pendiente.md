# QA pendiente — miniERP / Samiiwara

Última actualización: 2026-08-24

## Base productiva

- Producción: `https://prueba.gumorenos.space`
- SHA desplegado: `b6b51b0bc637e1b8504c0964c985f37ab96f67d0`
- Estado: PASS; health, smoke autenticado HTTPS, migraciones 15/15, E2E, concurrencia/idempotencia, stock negativo, Telegram simulado y Docker verificados por OpenClaw.
- OpenClaw no forma parte del runtime y no debe integrarse en Telegram ni WhatsApp.

## Candidato pendiente: captura conversacional multi-turno

Estado: publicado y validado localmente; aún no probado por OpenClaw ni desplegado.

- Rama: `qa/miniERP-conversation-multiturn`.
- SHA funcional exacto: `6e74797d86d58473fbd67269e3074c9c6d7bb368`.

Cambios principales:

- Migración `0016_capture_conversations.sql`.
- `conversation_key` en borradores.
- `capture_draft_messages` para auditar cada mensaje y evitar replay/duplicados.
- Respuestas posteriores completan el mismo borrador pendiente de la conversación.
- Se conserva la intención original y solo se actualizan campos faltantes o ambiguos.
- Confirmación y rechazo siguen siendo acciones explícitas; recibir texto nunca crea una operación definitiva.
- Telegram directo pasa `chat_id:user_id`; el núcleo queda preparado para WhatsApp.
- La UI interna permite continuar el mismo borrador por chat y exige talla real antes de confirmar.

Validación local:

- ESLint: PASS.
- TypeScript: PASS.
- Vitest: PASS, 55/55.
- Build: PASS.
- `git diff --check`: PASS.

## Gates que debe ejecutar OpenClaw

- [ ] Verificar que el SHA exacto del candidato existe y hacer checkout detached; sin fallback.
- [ ] `npm ci` y `npm run qa` en worktree aislado.
- [ ] Migraciones desde cero, incluida 0016.
- [ ] Migración idempotente sobre una copia de base con borradores históricos.
- [ ] E2E existente completo.
- [ ] Flujo multi-turno: crear borrador incompleto, responder, conservar el mismo `draftId`, completar y confirmar.
- [ ] Replay del mensaje inicial y de la respuesta: no duplicar borrador ni operación.
- [ ] Dos respuestas concurrentes: una sola actualización válida y sin registros duplicados.
- [ ] Confirmación concurrente: una sola operación de negocio.
- [ ] Telegram simulado: `DRAFT_CREATED`, `DRAFT_UPDATED`, preguntas, botones, confirmación y rechazo.
- [ ] Confirmar ausencia de referencias o dependencia de OpenClaw en runtime.
- [ ] Docker build y health en entorno aislado.
- [ ] Solo si todos los gates pasan: backup, deploy exacto, migraciones productivas, health y smoke.

## Telegram real — pendiente separado

No se debe bloquear el desarrollo por no tener Telegram disponible. Cuando existan credenciales privadas y chat autorizado:

- [ ] Configurar variables en el servidor, nunca en Git o Telegram.
- [ ] Registrar el webhook HTTPS directo de miniERP.
- [ ] Probar mensaje inicial, respuesta faltante, confirmación, rechazo y replay.
- [ ] Confirmar que el bot real no usa OpenClaw.

No inventar credenciales ni probar contra la base productiva durante QA.
