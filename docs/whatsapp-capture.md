# Captura por WhatsApp

## Estado

El adaptador inicial está implementado en el candidato de desarrollo, pero aún no está activado en producción. WhatsApp no pasa por OpenClaw.

## Flujo

    WhatsApp Cloud API -> webhook directo de miniERP -> borrador WHATSAPP -> confirmación humana -> operación del dominio

Los mensajes de texto crean o completan el mismo borrador conversacional que Telegram. Las respuestas interactivas permiten crear clientas, seleccionar productos similares, crear productos nuevos, confirmar o descartar. La creación de entidades sigue siendo explícita y la operación del pedido requiere confirmación.

## Endpoints

    GET  /api/integrations/whatsapp/webhook
    POST /api/integrations/whatsapp/webhook

El `GET` responde al desafío de verificación del proveedor. El `POST` valida `X-Hub-Signature-256`, procesa mensajes de texto y respuestas interactivas, y descarta los tipos no soportados.

## Variables privadas del servidor

    WHATSAPP_ACCESS_TOKEN=
    WHATSAPP_VERIFY_TOKEN=
    WHATSAPP_APP_SECRET=
    WHATSAPP_PHONE_NUMBER_ID=
    WHATSAPP_API_VERSION=v23.0
    WHATSAPP_BUSINESS_ID=
    WHATSAPP_USER_ID=
    WHATSAPP_ALLOWED_PHONE_NUMBERS=

`WHATSAPP_BUSINESS_ID` y `WHATSAPP_USER_ID` son UUID internos de miniERP. `WHATSAPP_ALLOWED_PHONE_NUMBERS` acepta una lista separada por comas y se normaliza a dígitos; para el piloto debe contener únicamente el número autorizado.

No colocar tokens, secretos ni números reales en Git, logs, prompts o mensajes. La integración permanece deshabilitada si falta cualquier variable o el usuario interno no está activo.

## Activación pendiente

1. Crear/configurar la aplicación de Meta y el número de WhatsApp Business.
2. Colocar las variables en `.env.production` con permisos restrictivos.
3. Registrar el callback HTTPS y completar la verificación con `WHATSAPP_VERIFY_TOKEN`.
4. Ejecutar QA aislado y smoke sin confirmar operaciones reales.
5. Desplegar el SHA aprobado y probar texto, multi-turno, botones/lista, replay y rechazo.
