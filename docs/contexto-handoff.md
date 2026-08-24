# Contexto de continuidad — miniERP

Última actualización: 2026-08-24

## Reglas de trabajo

- OpenClaw se usa únicamente para testing, QA y despliegue. No forma parte del runtime ni del flujo Telegram/WhatsApp.
- Telegram se conecta directamente al webhook de miniERP. WhatsApp será otro adaptador del mismo núcleo cuando la usuaria esté disponible.
- Todo candidato debe validarse por SHA exacto. OpenClaw no debe usar otro SHA, `HEAD` ni la cabeza de una rama como fallback.
- No enviar secretos, cookies, tokens ni datos reales por Telegram, Git o reportes.

## Producción

- URL: `https://prueba.gumorenos.space`
- SHA desplegado: `b6b51b0bc637e1b8504c0964c985f37ab96f67d0`
- Último reporte: QA aislado, 51/51 tests, migraciones 15/15, E2E, concurrencia/idempotencia, stock negativo, Telegram simulado, smoke autenticado HTTPS, Docker y health PASS.
- Producción no debe tocarse durante el desarrollo local de este incremento.

## Incremento actual: captura conversacional multi-turno

Implementado localmente y pendiente de publicar/validar con OpenClaw:

- `capture_drafts.conversation_key` para asociar mensajes de una conversación.
- Nueva tabla `capture_draft_messages` para idempotencia por mensaje y auditoría del texto recibido.
- Migración `0016_capture_conversations.sql`, con backfill de mensajes históricos.
- Las respuestas posteriores completan el borrador pendiente más reciente de la misma conversación, sin crear otro registro.
- Se conserva la intención original y solo se mezclan campos que estaban faltantes o ambiguos.
- Confirmación humana sigue siendo obligatoria; no se ejecuta ninguna operación al recibir una respuesta.
- Repetir un `sourceMessageId` devuelve el borrador existente sin reaplicar la respuesta.
- Telegram envía `conversationKey = chat_id:user_id`; WhatsApp podrá usar su identificador equivalente.
- Si el borrador sigue incompleto, se envían nuevas preguntas; si queda confirmable, se envían los botones habituales.

## Validación local actual

- ESLint: PASS.
- TypeScript: PASS.
- Vitest: PASS, 55/55 pruebas.
- Build Vite: PASS.
- `git diff --check`: PASS.

## Siguiente gate

Publicar un candidato basado en el SHA de producción, verificar que el commit exista en GitHub y entregar a OpenClaw un prompt con ese SHA exacto. OpenClaw debe ejecutar migración 0016, QA aislado, E2E, concurrencia/idempotencia de mensajes y Docker. No desplegar hasta que todos los gates pasen.

## Próximas etapas después del multi-turno

1. QA y eventual deploy del candidato multi-turno.
2. Configurar Telegram real cuando estén disponibles bot, chat y usuario autorizados; probar mensaje, respuesta, confirmación, rechazo y replay.
3. Observar uso real y ajustar parser/preguntas con evidencia.
4. Implementar el adaptador oficial de WhatsApp reutilizando el núcleo de captura, sin copiar lógica de negocio.
5. Luego: audio/imágenes y adjuntos, solo si el uso real lo justifica.
