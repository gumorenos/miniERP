# Contexto de continuidad — miniERP

Última actualización: 2026-08-21

## Proyecto y límites

- Repositorio: `gumorenos/miniERP`.
- Rama de trabajo: `codex/capture-operational-confirmation`.
- Producción: `https://prueba.gumorenos.space`, desplegada históricamente en `de5d3f6f5f088421fee8f3030652808076965656`.
- OpenClaw se usa únicamente como agente externo de testing/QA, backup y despliegue condicionado. No debe integrarse al runtime, al webhook ni a la lógica de negocio.
- No inventar credenciales Telegram ni usar producción para pruebas.

## Candidato canónico

- SHA exacto de código para la próxima validación: `8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0`.
- El SHA local original `b37dfea6a5da0caab8e9c3dc7e9dfa6987a90ba1` no existía en GitHub. Su estado fue publicado correctamente como `8da2c1b...` con padre remoto `81d0a279...`.
- Los commits posteriores de la rama son únicamente documentación. OpenClaw debe probar y desplegar el SHA `8da2c1b...`, no el HEAD documental ni otro SHA.
- Producción no fue tocada durante la corrección del bloqueo.

## Qué incluye el candidato

- Transacciones y locks para corte, bordado, ensamblaje, empaque, entrega, compras, ajustes y consumos de materiales.
- Idempotencia/concurrencia para evitar doble confirmación, doble consumo y stock negativo.
- Sesión web mediante cookie HttpOnly/SameSite; bearer compatible temporalmente para scripts; no persistir token de autenticación en localStorage.
- Headers CSP, HSTS y Permissions-Policy.
- Telegram restringido por chat y usuario mediante `TELEGRAM_ALLOWED_USER_IDS`.
- Captura conversacional y confirmación humana ya implementadas; OpenClaw no participa en ese flujo.

## Validación local ya realizada

- ESLint: PASS.
- TypeScript: PASS.
- Vitest: PASS, 45 pruebas en 11 archivos.
- Build Vite: PASS.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: PASS.
- No se pudo ejecutar Docker/PostgreSQL E2E localmente porque Docker no está disponible en este entorno.

## Próximo paso obligatorio: OpenClaw

Ejecutar el prompt de `docs/openclaw-qa-operations-prompt.md` o el compacto `docs/openclaw-qa-prompt.md`, fijado al SHA `8da2c1b...`.

Gates mínimos:

1. Verificar que el SHA exista, hacer checkout detached y comprobar que sea ancestro de la rama.
2. En worktree y PostgreSQL aislados: `npm ci`, `npm run qa`, migraciones desde cero y sobre copia, `npm run test:e2e`, concurrencia/idempotencia, callbacks Telegram simulados y `docker build`.
3. Verificar cookies HttpOnly, ausencia de token en localStorage, headers de seguridad, allowlist de usuario Telegram y ausencia de integración runtime con OpenClaw.
4. Si cualquier gate falla: STOP y no desplegar.
5. Solo con todo PASS: backup, etiqueta de rollback, deploy exacto de `8da2c1b...`, migraciones, healthcheck y smoke. Si falla deploy/smoke, rollback controlado.

## Después de un QA/deploy PASS

- Configurar secretos reales de Telegram en producción: bot token, webhook secret, business/user/chat allowlists.
- Registrar webhook HTTPS y probar mensaje, borrador, confirmar/rechazar, callbacks e idempotencia con datos sintéticos.
- Validar el flujo con la usuaria.
- Luego priorizar mejoras de ingreso por chat y seguimiento conversacional, según feedback real.

## Archivos operativos

- `docs/roadmap.md`: mapa de funcionalidades y prioridades.
- `docs/qa-pendiente.md`: gates pendientes e histórico de despliegues.
- `docs/openclaw-qa-operations-prompt.md`: prompt detallado.
- `docs/openclaw-qa-prompt.md`: prompt compacto para Telegram.
- `docs/telegram-capture.md`: contrato del canal Telegram.
- `docs/authentication.md`: sesión y autenticación web.

## Regla de continuidad

Antes de actuar, verificar el HEAD remoto y conservar como referencia el SHA canónico `8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0`. No reemplazarlo silenciosamente por el HEAD de la rama, no modificar producción sin QA PASS y no volver a conectar OpenClaw al producto.
