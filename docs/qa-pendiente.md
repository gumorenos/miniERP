# QA pendiente — miniERP / Samiiwara

Última actualización: 2026-08-24.

## Estado verificado

- Producción: `https://prueba.gumorenos.space`.
- SHA productivo anterior: `de5d3f6f5f088421fee8f3030652808076965656`.
- Candidato funcional exacto: `b6b51b0bc637e1b8504c0964c985f37ab96f67d0`.
- Rama de referencia: `qa/miniERP-auth-cookie-fix-v2`.
- OpenClaw solo realiza QA, backups y deploy; no forma parte del runtime.

## Causa raíz de los bloqueos anteriores

Producción `de5d3f6…` usa autenticación legacy por token Bearer y no emite `Set-Cookie`. El candidato `b6b51b0…` introduce la cookie `minierp_session`.

El smoke estricto de cookie debe ejecutarse antes del deploy contra la aplicación candidata aislada y después del deploy contra producción actualizada. No debe ejecutarse contra la producción legacy como requisito previo, porque fallará siempre con `AUTH_COOKIE_MISSING`.

## QA ya ejecutado sobre b6b51b0

- [x] SHA remoto y checkout detached exactos.
- [x] `npm ci`: PASS; 0 vulnerabilidades.
- [x] Lint y typecheck: PASS.
- [x] Vitest: PASS, 51/51 pruebas.
- [x] Build: PASS.
- [x] Migraciones desde cero: PASS, 15/15.
- [x] Migraciones idempotentes y sobre copia productiva: PASS.
- [x] E2E, concurrencia e idempotencia: PASS.
- [x] Stock negativo rechazado con HTTP 409.
- [x] Docker build: PASS.
- [ ] Smoke autenticado estricto contra el candidato levantado en QA aislado.
- [ ] Backup PostgreSQL y etiqueta de rollback.
- [ ] Deploy exacto del candidato.
- [ ] Smoke autenticado estricto contra producción HTTPS después del deploy.
- [ ] Rollback inmediato si el smoke productivo falla.

## Pendiente posterior

- [ ] Activar Telegram real con secretos privados y allowlists de chat/usuario.
- [ ] Registrar webhook HTTPS y probar mensaje, borrador, confirmar/rechazar e idempotencia.
- [ ] Implementar seguimiento multi-turno: asociar respuestas al borrador pendiente y mezclar campos.
- [ ] Evaluar conexión oficial WhatsApp cuando la usuaria esté disponible.

## Reglas

- Sin fallback de SHA.
- Sin pruebas destructivas en producción.
- Sin credenciales, cookies o tokens en Telegram/informes.
- Sin OpenClaw en el runtime.
