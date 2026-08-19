# QA pendiente — miniERP / Samiiwara

Última actualización: 2026-08-18

## Base revisada

- Rama candidata: `codex/telegram-direct-candidate`
- Commit candidato: `HEAD` de esa rama (`Implement direct Telegram capture webhook`); obtener el SHA con `git rev-parse HEAD` después del push.
- Producción: no tocada.
- OpenClaw: no requerido para el desarrollo; se usará únicamente para QA/despliegue cuando vuelva a estar disponible.

## Validaciones ejecutadas localmente

- TypeScript (`tsc --noEmit`): PASS.
- ESLint: PASS.
- Vitest: PASS, 38 pruebas en 11 archivos.
- Build Vite: PASS.
- `git diff --check`: PASS.

Estas validaciones no prueban la ejecución contra PostgreSQL.

## Pendiente antes de aprobar el cambio

### P0 — PostgreSQL aislado

- [ ] Ejecutar las migraciones desde cero en una base efímera.
- [ ] Ejecutar las migraciones sobre una copia de una base existente y verificar que no alteren datos históricos.
- [ ] Confirmar que `0012_order_number_counters.sql` inicializa el contador con el máximo existente.
- [ ] Confirmar que `0013_capture_confirmation.sql` agrega `confirmed_order_id` y conserva los borradores existentes.
- [ ] Confirmar que `0014_updated_at_triggers.sql` funciona en todas las tablas con `updated_at`:
  `businesses`, `users`, `customers`, `materials`, `products`, `orders`, `suppliers`, `embroidery_providers` y `capture_drafts`.

### P0 — Concurrencia e idempotencia

- [ ] Crear varios pedidos simultáneamente para el mismo negocio y comprobar que todos reciben números distintos y consecutivos.
- [ ] Enviar dos veces el mismo `channel + sourceMessageId` simultáneamente y comprobar que existe un solo borrador.
- [ ] Confirmar el mismo borrador de pedido simultáneamente y comprobar que existe un solo pedido, un solo adelanto y un solo estado `CONFIRMED`.
- [ ] Repetir la confirmación después de completarse y comprobar que devuelve el pedido existente sin crear otro.
- [ ] Confirmar simultáneamente un borrador `NEW_CUSTOMER` y comprobar que no duplica el cliente.
- [ ] Rechazar simultáneamente un borrador y comprobar que solo una solicitud gana.

### P1 — Regresión funcional

- [ ] Ejecutar `npm run test:e2e` contra una base aislada.
- [ ] Crear pedido manual con y sin adelanto.
- [ ] Editar pedido, producto, talla y pagos.
- [ ] Verificar costos estimados, margen y saldo, incluyendo valores negativos y decimales.
- [ ] Verificar que los headers `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy` aparecen también en respuestas de Hono y archivos estáticos.
- [ ] Verificar rate limit en login y mutaciones, incluyendo `429` y `Retry-After`.
- [ ] Verificar que un error inesperado no expone stack traces ni detalles de PostgreSQL.
- [ ] Construir la imagen Docker y confirmar que el runtime contiene solo dependencias de producción.

### P1 — Captura conversacional interna

- [ ] Crear borrador de pedido completo y dejarlo pendiente antes de confirmar.
- [ ] Resolver cliente y producto desde el catálogo.
- [ ] Rechazar cliente/producto ambiguo.
- [ ] Confirmar nombre de cliente de un carácter y comprobar que se rechaza.
- [ ] Verificar que compras, gastos y ajustes siguen siendo borradores y no mutan el dominio.

### P1 — Telegram directo

El webhook directo ya está implementado localmente en `POST /api/integrations/telegram/webhook`. Falta validarlo contra PostgreSQL y la API de Telegram en un entorno controlado:

- [ ] Validación del header `x-telegram-bot-api-secret-token` y configuración fail-closed.
- [ ] Lista autorizada de `chat_id`, incluyendo chats negativos de grupos.
- [ ] Idempotencia por `chat_id:message_id` con dos entregas del mismo update.
- [ ] Botones de confirmar/descarte y callbacks con `draftId` UUID.
- [ ] Confirmación concurrente del mismo callback sin duplicar pedido o cliente.
- [ ] Token y secreto únicamente en el entorno privado del servidor.
- [ ] Prueba con datos sintéticos sin activar ningún puente de OpenClaw.
- [ ] Verificar mensajes enviados por `sendMessage` y `answerCallbackQuery`.

## Condición de aprobación

No hacer merge ni deploy hasta completar los P0 en PostgreSQL aislado. El QA debe reportar el commit exacto probado, la base usada, migraciones aplicadas, resultados de concurrencia y confirmación explícita de que producción no fue tocada.

## Comandos sugeridos

```bash
npm run qa
npm run db:migrate
npm run test:e2e
docker build -t minierp-qa .
```

Los comandos de base de datos y E2E deben ejecutarse contra una instancia de QA, nunca contra producción.
