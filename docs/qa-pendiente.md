# QA pendiente — miniERP / Samiiwara

Última actualización: 2026-08-21

## Base revisada

- Rama validada/desplegada: `codex/capture-operational-confirmation`
- Commit exacto: `de5d3f6f5f088421fee8f3030652808076965656`
- Producción: desplegada y saludable en `https://prueba.gumorenos.space`.
- OpenClaw: usado únicamente para QA y despliegue; no forma parte del runtime.

## Estado de producción

- OpenClaw confirmó PASS de QA, migraciones, E2E, concurrencia/idempotencia, callbacks Telegram simulados y Docker antes del deploy.
- Healthcheck de producción: PASS.
- Smoke de login real: pendiente porque las credenciales disponibles devolvieron `400`; no se inventaron credenciales ni se tocó producción durante este trabajo.

## Validaciones ejecutadas

- TypeScript (`tsc --noEmit`): PASS.
- ESLint: PASS.
- Vitest: PASS, 38 pruebas en 11 archivos.
- Build Vite: PASS.
- `git diff --check`: PASS.

## Candidato post-code-review: hardening transaccional

- Rama: `codex/capture-operational-confirmation`.
- Candidato remoto exacto: `8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0`.
- Candidato siguiente exacto: `fd1b9a7017433ab23d1fb1b4dad66f70befa3ca7` (añade `npm run smoke:auth` y documentación; requiere repetir QA antes de desplegar).
- Estado: QA aislado PASS; deploy intentado y revertido por smoke autenticado.
- Producción permanece en `de5d3f6f5f088421fee8f3030652808076965656`; el candidato no quedó activo.
- Validación local directa: ESLint PASS, TypeScript PASS, 45 pruebas PASS en 11 archivos, build Vite PASS y audit de producción sin vulnerabilidades.
- QA OpenClaw: migraciones 15/15, E2E, concurrencia/idempotencia, stock negativo, Telegram simulado, cookies/headers y Docker: PASS.
- Bloqueo operativo: smoke autenticado devolvió HTTP 400 con las credenciales configuradas. En el candidato, credenciales inválidas producen 401; 400 requiere revisar payload/credenciales bootstrap.
- Cambios: locks por pedido y material; corte, bordado y transiciones atómicos; consumos de ensamblaje/empaque protegidos contra carreras; ajustes manuales y edición/anulación de compras protegidos contra stock negativo concurrente; E2E concurrente para acciones operativas.
- Hardening adicional: sesión web por cookie `HttpOnly` sin persistencia de token en `localStorage`; CSP, HSTS y Permissions-Policy; webhook Telegram restringido por chat y usuario mediante `TELEGRAM_ALLOWED_USER_IDS`.
- El E2E requiere una base PostgreSQL efímera para ejecutarse.

### Gates pendientes para este candidato

- [x] Ejecutar `npm ci` y `npm run qa` en worktree aislado.
- [x] Ejecutar `npm run test:e2e` contra PostgreSQL efímero.
- [x] Ejecutar concurrencia de corte, envío/recepción de bordado, ensamblaje y preparación de entrega.
- [x] Ejecutar concurrencia de ajustes manuales, edición/anulación de compras y consumos de stock compartido; confirmar que nunca quede stock negativo.
- [x] Repetir migraciones desde cero y sobre una copia de producción.
- [x] Docker build, headers, cookies, Telegram simulado y ausencia de integración runtime OpenClaw.
- [ ] Capturar el cuerpo exacto del HTTP 400 del smoke autenticado y validar correo/password bootstrap.
- [ ] Con credenciales piloto válidas, repetir deploy controlado y smoke autenticado del SHA exacto.
- [ ] Solo con todos los gates en PASS: mantener el candidato desplegado.

## QA aislado completado por OpenClaw

- `npm ci`: PASS, 199 paquetes.
- `npm run qa`: PASS.
- Migraciones desde cero: PASS, 14/14.
- Migraciones sobre copia de la base real: PASS; datos intactos (1 negocio, 4 clientes y 4 pedidos).
- Contador de pedidos, borradores, triggers `updated_at`, E2E y regresión: PASS.
- Concurrencia/idempotencia: PASS, 6/6 escenarios.
- Headers, rate limit, aislamiento del webhook directo y ausencia de conexión al endpoint legacy de OpenClaw: PASS.
- Docker build: PASS.

## Deploy controlado completado

- Backup previo: `backups/minierp-samiiwara/minierp-prod-pre-1a76b00-20260819T000527-0500.dump`.
- Imagen de rollback: `minierp_samiiwara_prod-app:rollback-dddb892-c6781cb3649c`.
- Migraciones en producción: PASS, 14/14.
- Healthcheck: PASS, `/api/health` devuelve `200` con base de datos `ok`.
- Smoke de sesión sin token: PASS, devuelve `401`.
- Login con credenciales bootstrap: `400` esperado; son credenciales one-shot ya rotadas.
- Rollback: no requerido.

## Pendiente post-deploy: Telegram real

Los gates P0/P1 del candidato están cerrados. Queda pendiente activar el canal Telegram:

### Configuración y prueba pendiente: Telegram real

- [ ] Guardar `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BUSINESS_ID`, `TELEGRAM_USER_ID`, `TELEGRAM_ALLOWED_CHAT_IDS` y `TELEGRAM_ALLOWED_USER_IDS` en el entorno privado de producción.
- [ ] Registrar el webhook oficial usando la URL HTTPS y el secreto configurado.
- [ ] Probar con datos sintéticos: mensaje, borrador, botones confirmar/rechazar y callbacks.
- [ ] Repetir un update y confirmar que no duplica el borrador ni el pedido.
- [ ] Verificar `sendMessage` y `answerCallbackQuery` con el bot real.
- [ ] Confirmar el flujo con la usuaria y, después de aprobar el candidato de operaciones, definir el siguiente incremento: seguimiento conversacional de borradores.

El webhook directo es `POST /api/integrations/telegram/webhook`. No activar el endpoint legacy de OpenClaw ni enviarle tokens o datos de negocio.

## Condición de aprobación

El candidato `8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0` pasó QA, pero no quedó aprobado para producción porque el smoke autenticado devolvió HTTP 400. Producción fue revertida a `de5d3f6f5f088421fee8f3030652808076965656`. No activar Telegram con datos reales hasta cerrar el smoke autenticado.

## Comandos sugeridos

```bash
npm run qa
npm run db:migrate
npm run test:e2e
docker build -t minierp-qa .
```

Los comandos de base de datos y E2E deben ejecutarse contra una instancia de QA, nunca contra producción.
