# Contexto de continuidad — miniERP

Última actualización: 2026-08-23

## Proyecto y límites

- Repositorio: `gumorenos/miniERP`.
- Rama de trabajo: `codex/capture-operational-confirmation`.
- Producción: `https://prueba.gumorenos.space`, desplegada históricamente en `de5d3f6f5f088421fee8f3030652808076965656`.
- OpenClaw se usa únicamente como agente externo de testing/QA, backup y despliegue condicionado. No debe integrarse al runtime, al webhook ni a la lógica de negocio.
- No inventar credenciales Telegram ni usar producción para pruebas.

## Candidato canónico

- SHA exacto de código para la próxima validación: `a92ac8d3efbdc8fef7ba3ea727078a996b775dca`.
- El SHA local original `b37dfea6a5da0caab8e9c3dc7e9dfa6987a90ba1` no existía en GitHub. Su estado fue publicado correctamente como `8da2c1b...` con padre remoto `81d0a279...`.
- Los commits posteriores de la rama incluyen documentación; OpenClaw debe probar y desplegar exactamente `a92ac8d3efbdc8fef7ba3ea727078a996b775dca`, no el HEAD documental ni otro SHA.
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
- Vitest: PASS, 48 pruebas en 12 archivos (incluye 3 pruebas de extracción de cookie desde headers crudos).
- Build Vite: PASS.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: PASS.
- No se pudo ejecutar Docker/PostgreSQL E2E localmente porque Docker no está disponible en este entorno.

## Estado de QA y deploy del candidato

OpenClaw verificó previamente el SHA `8da2c1b48cc3a0ef03d3cda20ccd1917e5cb47f0`. En el candidato `a92ac8d3efbdc8fef7ba3ea727078a996b775dca` se añadió el diagnóstico de smoke:

- QA aislado previo: PASS; 45/45 tests, migraciones 15/15, E2E, concurrencia/idempotencia, stock negativo, Telegram simulado, cookies/headers, ausencia de integración runtime y Docker.
- Fix local del harness: PASS; 48/48 tests, incluyendo 3 pruebas de extracción desde headers HTTP crudos.
- El nuevo SHA aún requiere QA aislado de OpenClaw y smoke autenticado productivo.
- Deploy productivo anterior: bloqueado; no se aplicaron migraciones ni se tocó producción.
- No se aplicaron migraciones ni se tocó producción; health público sigue 200 y producción sigue en `de5d3f6f5f088421fee8f3030652808076965656`.

## Próximo paso obligatorio

El siguiente paso requiere que OpenClaw repita QA sobre el nuevo SHA y luego disponga de una cuenta piloto válida para el smoke productivo. Puede ser la contraseña permanente guardada en el gestor de contraseñas o un reset one-shot controlado mediante `bootstrap-user` directamente en el VPS. No inventar credenciales, no enviarlas por Telegram y dejar vacíos los valores bootstrap después de la operación. Luego repetir el deploy condicionado del SHA exacto `a92ac8d3efbdc8fef7ba3ea727078a996b775dca`.

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
- Ambos prompts OpenClaw comienzan ahora con contexto mínimo explícito: proyecto, objetivo, SHA, estado actual, límites y criterio de STOP.
- `docs/telegram-capture.md`: contrato del canal Telegram.
- `docs/authentication.md`: sesión y autenticación web.

## Regla de continuidad

Antes de actuar, verificar el HEAD remoto y conservar como referencia el SHA canónico `a92ac8d3efbdc8fef7ba3ea727078a996b775dca`. No reemplazarlo silenciosamente por el HEAD de la rama, no modificar producción sin QA PASS y no volver a conectar OpenClaw al producto.
