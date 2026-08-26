# Continuidad — miniERP / Samiiwara

Última actualización: 2026-08-25

## Reglas de trabajo

- ChatGPT desarrolla y modifica el código.
- OpenClaw solo hace testing, QA, backup y deploy. No forma parte del runtime.
- Telegram se conecta directamente al webhook de miniERP. WhatsApp será un adaptador posterior del mismo núcleo.
- Cada candidato debe validarse por SHA exacto. OpenClaw no puede sustituirlo por `HEAD`, otra rama o un SHA distinto.
- No enviar secretos, cookies, tokens ni datos reales por Git, Telegram o reportes.

## Estado productivo

- URL: `https://prueba.gumorenos.space`
- SHA desplegado: `eb455839c42ef0b6e411edfc4f356dae3fe00b1d`
- Último resultado: PASS en QA aislado, 55/55 tests, migraciones 16/16, E2E, concurrencia/idempotencia, multi-turno, stock negativo, Telegram simulado 19/19, Docker, backup, health y smoke autenticado HTTPS.
- Backup previo validado: `/home/ubuntu/apps/minierp-samiiwara/backups/minierp-prod-pre-eb455839-20260825T2121-0500.dump`.
- Producción quedó desplegada exactamente en el candidato; no fue necesario rollback.

## Candidato actual

- Rama: `qa/miniERP-conversation-multiturn`.
- SHA funcional exacto: `eb455839c42ef0b6e411edfc4f356dae3fe00b1d`.
- Estado: QA remoto PASS y desplegado en producción.

Incluye:

- Migración `0016_capture_conversations.sql`.
- `conversation_key` para asociar mensajes de una misma conversación.
- Tabla `capture_draft_messages` para auditoría e idempotencia por mensaje.
- Respuestas posteriores que completan el mismo borrador sin crear registros duplicados.
- Conservación de la intención original y actualización solo de campos faltantes o ambiguos.
- Confirmación humana obligatoria antes de ejecutar cualquier operación.
- Webhook Telegram directo con `conversationKey = chat_id:user_id`.
- UI interna “Capturar por chat” con seguimiento multi-turno.
- La talla no aparece preseleccionada; confirmar queda bloqueado mientras falten datos.

## Validación

- ESLint: PASS.
- TypeScript: PASS.
- Vitest: PASS, 55/55 pruebas.
- Build Vite: PASS.
- `git diff --check`: PASS.
- QA remoto/OpenClaw: PASS; Telegram simulado 19/19, health y smoke autenticado local/público PASS.

## Próximo orden de trabajo

1. Configurar Telegram real cuando estén disponibles bot, chat y usuario autorizados; registrar el webhook directo y probar el flujo completo.
2. Observar el uso real y ajustar parser/preguntas con evidencia.
3. Implementar el adaptador oficial de WhatsApp reutilizando el núcleo conversacional.
4. Evaluar audio, imágenes y adjuntos después de estabilizar el flujo textual.
5. Atender hardening operativo: Cloudflare Access, backups automatizados/restore periódico, CSRF explícito y gestión de secretos.

## Riesgos heredados para vigilar

- QA de API/integración todavía debe ampliar cobertura más allá de los tests unitarios y E2E existentes.
- Revisar rendimiento de `/api/bootstrap` y posibles consultas N+1 cuando aumente el volumen.
- Mantener validación de `businessId` en relaciones cross-table.
- Cloudflare Access productivo, MFA, recuperación de contraseña, backups automatizados y restore periódico siguen pendientes.
