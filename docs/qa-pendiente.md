# QA pendiente — miniERP / Samiiwara

Última actualización: 2026-08-24.

## Estado productivo

- URL: `https://prueba.gumorenos.space`.
- SHA actual: `b6b51b0bc637e1b8504c0964c985f37ab96f67d0`.
- Producción saludable: health local y externo HTTP 200.
- Migraciones productivas: 15 aplicadas.
- Backup previo: `/home/ubuntu/apps/minierp-samiiwara/backups/minierp-prod-before-b6b51b0-20260823-2359.dump`.
- Rollback tag: `rollback/minierp-prod-de5d3f6-20260823-2359`.
- OpenClaw solo realiza QA, backups y deploy; no forma parte del runtime.

## QA y deploy de b6

- [x] SHA exacto y checkout detached.
- [x] `npm ci`, 0 vulnerabilidades.
- [x] Lint, typecheck, 51/51 tests y build.
- [x] Migraciones desde cero, idempotentes y sobre copia productiva.
- [x] E2E, concurrencia e idempotencia.
- [x] Stock negativo rechazado con HTTP 409.
- [x] Telegram simulado 15/15.
- [x] Docker build.
- [x] Smoke aislado: `AUTH_SMOKE_PASS`.
- [x] Deploy exacto de b6.
- [x] Smoke autenticado HTTPS post-deploy: `AUTH_SMOKE_PASS`.
- [x] Health local/externo HTTP 200.
- [x] Rollback no requerido.

## Pendiente funcional

- [ ] Configurar secretos Telegram en producción sin exponerlos en Telegram.
- [ ] Registrar webhook HTTPS.
- [ ] Probar con el bot real: mensaje, borrador, confirmar, rechazar y callbacks.
- [ ] Repetir un update y verificar que no duplique borrador ni registro.
- [ ] Validar la experiencia de captura con la usuaria.
- [ ] Implementar seguimiento conversacional multi-turno.
- [ ] Evaluar WhatsApp oficial cuando exista contacto y proveedor/API.

## Reglas

- No redeployar b6: ya está en producción.
- Para una nueva versión, publicar y verificar un SHA nuevo antes de pedir QA.
- Sin fallback de SHA.
- Sin pruebas destructivas en producción.
- Sin credenciales, cookies o tokens en informes.
- Sin OpenClaw en el runtime.
