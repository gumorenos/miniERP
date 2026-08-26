# QA — miniERP / Samiiwara

Última actualización: 2026-08-25

## Base productiva

- URL: `https://prueba.gumorenos.space`
- SHA desplegado: `eb455839c42ef0b6e411edfc4f356dae3fe00b1d`
- Estado: PASS en health, smoke autenticado HTTPS, migraciones 16/16, E2E, concurrencia/idempotencia, multi-turno, stock negativo, Telegram simulado 19/19 y Docker.
- OpenClaw no forma parte del runtime.

## Gates generales

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Migraciones contra PostgreSQL efímero.
- Migraciones idempotentes sobre copia de producción.
- `npm run test:e2e`.
- Pruebas de concurrencia e idempotencia.
- Docker build y healthcheck.
- Smoke autenticado antes de cualquier deploy.

El E2E cubre creación de cliente, pedido, adelanto, corte con descuento de stock una sola vez, bordado, vencimiento, pago final, entrega/cierre y margen.

## Último candidato desplegado

- Rama: `qa/miniERP-conversation-multiturn`.
- SHA exacto: `eb455839c42ef0b6e411edfc4f356dae3fe00b1d`.
- Estado: QA remoto PASS y desplegado exactamente en producción.

Validación local actual:

- ESLint: PASS.
- TypeScript: PASS.
- Vitest: PASS, 55/55.
- Build Vite: PASS.
- `git diff --check`: PASS.

## Gates completados del candidato

- [x] Verificar existencia del SHA y checkout detached exacto; sin fallback.
- [x] Ejecutar `npm ci` y `npm run qa` en worktree aislado.
- [x] Migrar desde cero 0001–0016 y repetir migraciones idempotentes.
- [x] Validar multi-turno, mismo `draftId`, replay e idempotencia.
- [x] Validar Telegram simulado, UI interna, botones, confirmación y rechazo.
- [x] Confirmar que la UI no preselecciona talla S cuando falta.
- [x] Confirmar ausencia de referencias OpenClaw en el runtime.
- [x] Docker build, backup, deploy exacto, migraciones productivas, health y smoke autenticado.

## QA de Telegram real — pendiente separado

Cuando existan credenciales privadas y chat autorizado:

- [ ] Configurar variables solo en el servidor.
- [ ] Registrar webhook HTTPS directo de miniERP.
- [ ] Probar mensaje, respuesta faltante, confirmación, rechazo y replay.
- [ ] Confirmar que Telegram no pasa por OpenClaw.

No probar contra producción durante QA ni inventar credenciales. La prueba real de Telegram sigue separada y pendiente.

## QA aislado

La base de QA debe ser desechable y nunca contener datos reales. Para E2E production-like:

```sh
docker compose --env-file .env.production -f compose.prod.yml --profile ops run --rm bootstrap-user
E2E_FIXTURES_CONFIRM=isolated-qa-db \
  docker compose --env-file .env.production -f compose.prod.yml --profile qa run --rm qa-fixtures
E2E_BASE_URL=http://127.0.0.1:${APP_HOST_PORT} npm run test:e2e
```

El fixture exige confirmación explícita y rechaza bases con datos existentes.

## Smoke autenticado

```sh
AUTH_SMOKE_BASE_URL=https://prueba.gumorenos.space \
  APP_USER_EMAIL='pilot@example.com' \
  APP_USER_PASSWORD='use-a-secret-from-the-password-manager' \
  npm run smoke:auth
```

Nunca guardar credenciales, cookies o tokens en Git, logs o Telegram.
