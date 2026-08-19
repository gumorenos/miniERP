# QA pendiente — miniERP / Samiiwara

Última actualización: 2026-08-19

## Base revisada

- Rama validada/desplegada: `codex/telegram-direct-candidate`
- Commit exacto: `1a76b00f28ddd5676753133689e24405d0f953f0`
- Producción: desplegada y saludable en `https://prueba.gumorenos.space`.
- OpenClaw: usado únicamente para QA y despliegue; no forma parte del runtime.

## Validaciones ejecutadas

- TypeScript (`tsc --noEmit`): PASS.
- ESLint: PASS.
- Vitest: PASS, 38 pruebas en 11 archivos.
- Build Vite: PASS.
- `git diff --check`: PASS.

## Candidato de desarrollo siguiente: operaciones conversacionales

- Rama local: `codex/capture-operational-confirmation`.
- Commit local exacto: `8cfa285cf0a080a3c29b5d7190121024e1b4f9b3`.
- Candidato de código publicado para re-QA: `de5d3f6f5f088421fee8f3030652808076965656`.
- Estado: corregido y publicado para re-QA; no desplegado y no aprobado todavía para producción.
- Producción permanece en `1a76b00f28ddd5676753133689e24405d0f953f0`; no fue tocada durante este incremento.
- Validación local directa: ESLint PASS, TypeScript PASS, 44 pruebas PASS en 11 archivos, build Vite PASS y `git diff --check` PASS.
- Cambios funcionales: confirmación humana y transaccional de `NEW_PURCHASE`, `NEW_EXPENSE` y `STOCK_ADJUSTMENT`; resolución de materiales/proveedores; costo unitario con total derivado; persistencia de entidad confirmada; migración `0015_capture_operation_confirmation.sql`.
- El E2E `scripts/e2e-flow.ts` incorpora escenarios para las tres operaciones. El reporte anterior falló en la aserción del corte porque comparaba contra el saldo inicial aunque antes se habían sumado +2 por compra y +1 por ajuste; el candidato nuevo usa la línea base inmediatamente anterior al corte y verifica `actualFabricQty=1`. Aún requiere una base PostgreSQL efímera para ejecutarse.

### Gates pendientes para este candidato

- [ ] Aplicar la migración `0015_capture_operation_confirmation.sql` desde cero y sobre una copia de datos.
- [ ] Ejecutar `npm run qa` en el worktree aislado; la validación local equivalente usó binarios instalados directamente porque el wrapper `npm run` pidió aprobación de red.
- [ ] Ejecutar `npm run test:e2e` y comprobar compra, gasto, ajuste de stock y corte idempotente con el candidato `de5d3f6f5f088421fee8f3030652808076965656`.
- [ ] Comprobar transacción atómica: si falla la confirmación, no queda compra/línea/movimiento o gasto huérfano.
- [ ] Comprobar idempotencia: dos confirmaciones concurrentes del mismo borrador producen una sola operación.
- [ ] Comprobar que un ajuste de salida no permite stock negativo bajo concurrencia.
- [ ] Revisar callbacks Telegram con estos tres tipos de borrador; no requiere credenciales reales para el primer gate si se usan dependencias simuladas.
- [ ] Solo con todos los gates en PASS: backup, migraciones, health, smoke y deploy del SHA exacto. No desplegar desde esta rama sin aprobación explícita del reporte QA.

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

- [ ] Guardar `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BUSINESS_ID`, `TELEGRAM_USER_ID` y `TELEGRAM_ALLOWED_CHAT_IDS` en el entorno privado de producción.
- [ ] Registrar el webhook oficial usando la URL HTTPS y el secreto configurado.
- [ ] Probar con datos sintéticos: mensaje, borrador, botones confirmar/rechazar y callbacks.
- [ ] Repetir un update y confirmar que no duplica el borrador ni el pedido.
- [ ] Verificar `sendMessage` y `answerCallbackQuery` con el bot real.
- [ ] Confirmar el flujo con la usuaria y, después de aprobar el candidato de operaciones, definir el siguiente incremento: seguimiento conversacional de borradores.

El webhook directo es `POST /api/integrations/telegram/webhook`. No activar el endpoint legacy de OpenClaw ni enviarle tokens o datos de negocio.

## Condición de aprobación

El commit `1a76b00f28ddd5676753133689e24405d0f953f0` quedó aprobado para el despliegue y está en producción. No activar Telegram con datos reales hasta completar la configuración privada y la prueba sintética del canal.

## Comandos sugeridos

```bash
npm run qa
npm run db:migrate
npm run test:e2e
docker build -t minierp-qa .
```

Los comandos de base de datos y E2E deben ejecutarse contra una instancia de QA, nunca contra producción.
