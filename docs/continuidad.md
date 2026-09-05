# Continuidad — miniERP / Samiiwara

Última actualización: 2026-09-05

## Reglas de trabajo

- ChatGPT desarrolla y modifica el código.
- OpenClaw solo hace testing, QA, backup y deploy. No forma parte del runtime.
- Telegram se conecta directamente al webhook de miniERP. WhatsApp será un adaptador posterior del mismo núcleo.
- Cada candidato debe validarse por SHA exacto. OpenClaw no puede sustituirlo por `HEAD`, otra rama o un SHA distinto.
- No enviar secretos, cookies, tokens ni datos reales por Git, Telegram o reportes.

## Estado productivo

- URL: `https://prueba.gumorenos.space`
- SHA desplegado: `65944069ca7b9a9a6fda8cd10342f08073d611c1`
- Último resultado: PASS en QA/deploy, 61 tests, migraciones 16/16, E2E, concurrencia/idempotencia, Telegram simulado, Docker, backup, health y smoke autenticado HTTPS.
- Backup previo validado: `backups/minierp-prod-pre-65944069-20260903T082336-0500.dump`.
- Producción quedó desplegada exactamente en `65944069…`; no fue necesario rollback.

## Candidato actual

- Rama: `qa/miniERP-telegram-entity-resolution`.
- SHA funcional exacto remoto: `022703566033fb8c8fec13314985631951f2e938`.
- Estado: candidato publicado; QA remoto/deploy pendientes. OpenClaw debe probar exactamente este SHA, no el HEAD posterior de la rama.

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
- Cliente desconocido: botón explícito para crear clienta, sin creación silenciosa.
- Producto desconocido: hasta tres productos similares o botón para crear uno nuevo; la selección/creación conserva el mismo borrador.
- Crear producto requiere precio explícito, lo registra inicialmente como `OTHER` y no confirma la orden automáticamente.
- La UI interna ofrece las mismas acciones de resolución y puede usar el precio escrito en pantalla para crear el producto explícitamente.

## Validación

- ESLint: PASS.
- TypeScript: PASS.
- Vitest: PASS, 61/61 pruebas.
- Build Vite: PASS.
- `git diff --check`: PASS.
- QA remoto/OpenClaw del candidato: pendiente.

## Próximo orden de trabajo

1. Ejecutar QA y deploy condicionado del SHA `022703566…` mediante OpenClaw.
2. Probar manualmente con el bot autorizado y la UI interna los botones de cliente/producto, sin confirmar operaciones reales.
3. Observar el uso real y ajustar parser/preguntas con evidencia.
4. Implementar el adaptador oficial de WhatsApp reutilizando el núcleo conversacional.
5. Evaluar audio, imágenes y adjuntos después de estabilizar el flujo textual.
6. Atender hardening operativo: Cloudflare Access, backups automatizados/restore periódico, CSRF explícito y gestión de secretos.

## Riesgos heredados para vigilar

- QA de API/integración todavía debe ampliar cobertura más allá de los tests unitarios y E2E existentes.
- Revisar rendimiento de `/api/bootstrap` y posibles consultas N+1 cuando aumente el volumen.
- Mantener validación de `businessId` en relaciones cross-table.
- Cloudflare Access productivo, MFA, recuperación de contraseña, backups automatizados y restore periódico siguen pendientes.
