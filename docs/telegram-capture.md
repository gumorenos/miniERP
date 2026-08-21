# Captura por Telegram

## Decisión de arquitectura

OpenClaw no forma parte de la integración. Se utiliza únicamente para testing, QA y despliegue. La aplicación recibe las actualizaciones directamente desde la API oficial de Telegram.

Flujo:

    Telegram -> webhook directo de miniERP -> borrador TELEGRAM -> confirmación humana -> operación del dominio

El núcleo de captura es el mismo que usa la UI interna y podrá reutilizarse más adelante para un adaptador oficial de WhatsApp.

## Webhook

    POST /api/integrations/telegram/webhook

Telegram debe llamar al endpoint por HTTPS y enviar el header oficial:

    x-telegram-bot-api-secret-token: <TELEGRAM_WEBHOOK_SECRET>

La ruta no usa la sesión normal de la aplicación. La identidad de negocio queda fijada por `TELEGRAM_BUSINESS_ID` y `TELEGRAM_USER_ID`; ambos deben pertenecer a un usuario activo de la misma base. El chat se valida contra `TELEGRAM_ALLOWED_CHAT_IDS` y el remitente contra `TELEGRAM_ALLOWED_USER_IDS`. Para operaciones no se debe autorizar únicamente un grupo.

El adaptador responde al webhook y envía el contenido visible a la usuaria mediante la API del bot:

- `/start` y `/help` muestran instrucciones.
- Un mensaje de texto crea un borrador idempotente por `chat_id:message_id`.
- Si el borrador es confirmable, Telegram recibe botones `✅ Confirmar` y `🗑 Descartar`.
- Los callbacks usan datos internos `capture:confirm:<draftId>` o `capture:reject:<draftId>`.
- Confirmar o descartar llama al núcleo de captura; el adaptador no ejecuta SQL de negocio por su cuenta.

Las actualizaciones que no sean mensajes de texto o callbacks reconocidos se ignoran con respuesta exitosa para evitar reintentos innecesarios de Telegram.

## Variables requeridas

    TELEGRAM_BOT_TOKEN=
    TELEGRAM_WEBHOOK_SECRET=
    TELEGRAM_BUSINESS_ID=
    TELEGRAM_USER_ID=
    TELEGRAM_ALLOWED_CHAT_IDS=
    TELEGRAM_ALLOWED_USER_IDS=

Requisitos:

- El token y el secreto viven únicamente en el entorno privado del servidor.
- El secreto debe tener al menos 32 caracteres.
- `TELEGRAM_ALLOWED_CHAT_IDS` es una lista separada por comas y no puede quedar vacía.
- `TELEGRAM_ALLOWED_USER_IDS` es una lista separada por comas y no puede quedar vacía.
- La integración queda deshabilitada si falta cualquiera de las variables o la cuenta configurada no está activa.
- Nunca colocar valores reales en Git, logs, prompts o mensajes de Telegram.

Para generar un secreto localmente:

    openssl rand -hex 32

## Operación segura

- El rate limit del webhook se aplica por chat y la idempotencia se apoya en el índice del núcleo de captura.
- Los errores internos no se envían a Telegram con detalles de PostgreSQL.
- El token del bot no se incluye en logs ni en respuestas HTTP.
- El QA debe usar chats y datos sintéticos autorizados; nunca se debe probar contra la base productiva.
- OpenClaw no debe instalarse como dependencia ni configurarse como puente de mensajes.

## Activación pendiente

1. Crear el bot y obtener el token sin registrarlo en el repositorio.
2. Elegir el chat autorizado y obtener su `chat_id`.
3. Configurar las cinco variables en el entorno privado del VPS.
4. Registrar el webhook HTTPS en Telegram.
5. Ejecutar QA aislado con PostgreSQL, incluyendo idempotencia, botones y callbacks.
6. Desplegar solo el commit exacto aprobado por QA y hacer smoke test.

El endpoint legacy `POST /api/integrations/telegram/capture` y las variables `TELEGRAM_CAPTURE_*` se conservan solo como referencia histórica y no deben configurarse.
