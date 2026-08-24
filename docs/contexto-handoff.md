# Contexto de continuidad — miniERP / Samiiwara

Última actualización: 2026-08-24.

## Reglas

- ChatGPT desarrolla el producto.
- OpenClaw solo ejecuta testing, QA, backups y deploy condicionado.
- No integrar OpenClaw al runtime, Telegram ni WhatsApp.
- Verificar siempre el SHA exacto en GitHub; no usar HEAD ni otro commit como fallback.
- Nunca compartir contraseñas, cookies o tokens en Telegram.

## Estado actual

- Repositorio: `gumorenos/miniERP`.
- Producción: `https://prueba.gumorenos.space`.
- SHA productivo actual: `b6b51b0bc637e1b8504c0964c985f37ab96f67d0`.
- SHA productivo anterior: `de5d3f6f5f088421fee8f3030652808076965656`.
- Deploy de b6: PASS; no se requirió rollback.
- Migraciones productivas: 15 aplicadas y registradas.
- Health local y externo: HTTP 200.
- Smoke autenticado HTTPS post-deploy: `AUTH_SMOKE_PASS`.

## Registro del deploy b6

- Backup: `/home/ubuntu/apps/minierp-samiiwara/backups/minierp-prod-before-b6b51b0-20260823-2359.dump`.
- Rollback tag: `rollback/minierp-prod-de5d3f6-20260823-2359`.
- Imagen desplegada: `sha256:29866fca…`.
- QA: 51/51 tests, 0 vulnerabilidades, lint/typecheck/build PASS.
- QA aislado: migraciones 15/15, E2E, concurrencia/idempotencia, stock negativo 409 y Telegram simulado PASS.

## Causa raíz ya resuelta

La producción anterior usaba Bearer y no emitía cookie. El candidato b6 introdujo `minierp_session` HttpOnly. Los prompts anteriores exigían cookie contra la producción vieja antes del deploy, creando un gate circular. El procedimiento fue corregido y b6 pasó el smoke aislado y el smoke productivo posterior al deploy.

## Funcionalidad actualmente desplegada

- Hardening transaccional, locks e idempotencia.
- Protección contra stock negativo y doble consumo.
- Sesión browser mediante cookie HttpOnly; sin token en localStorage.
- Headers de seguridad y autorización Telegram por chat/usuario.
- Captura conversacional para pedido, cliente, compra, gasto y ajuste.
- Preguntas legibles para campos faltantes o ambiguos.
- Confirmación humana antes de guardar.
- Smoke auth robusto para Set-Cookie, rawHeaders y headers combinados.

## Próximos pasos

1. Configurar Telegram real con secretos privados, allowlists y webhook HTTPS.
2. Ejecutar prueba sintética real: mensaje, borrador, confirmar, rechazar y repetición idempotente.
3. Validar la experiencia con la usuaria.
4. Implementar conversación multi-turno: asociar respuestas posteriores al borrador pendiente, mezclar campos y volver a pedir confirmación sin duplicar registros.
5. Evaluar WhatsApp cuando exista contacto con la usuaria y se defina proveedor/API.

## Estado de OpenClaw

OpenClaw no es parte de la aplicación. No ejecutar nuevamente el prompt de deploy de b6: ya está desplegado. Para cualquier nueva funcionalidad, ChatGPT debe publicar primero un nuevo SHA y preparar un prompt autocontenido con ese candidato exacto.
