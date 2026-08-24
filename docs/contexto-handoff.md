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
- SHA productivo: `de5d3f6f5f088421fee8f3030652808076965656`.
- Candidato funcional exacto: `b6b51b0bc637e1b8504c0964c985f37ab96f67d0`.
- Rama de referencia: `qa/miniERP-auth-cookie-fix-v2`.
- Los commits posteriores en la rama pueden actualizar documentación; el candidato funcional sigue siendo b6b51b0.

## Diagnóstico comprobado del bloqueo AUTH_COOKIE_MISSING

La producción actual `de5d3f6…` usa token Bearer y guarda el token en `localStorage`. Su login no envía `Set-Cookie`.

El candidato `b6b51b0…` cambia la autenticación a cookie `HttpOnly` y sí agrega `Set-Cookie`.

Los prompts anteriores exigían el smoke nuevo con cookie contra producción vieja antes de desplegar el código nuevo. Ese gate era circular y nunca podía aprobar.

Flujo correcto:

1. Validar el candidato aislado, incluyendo `npm run smoke:auth` contra la instancia candidata.
2. En producción antigua comprobar health y, si aplica, el login legacy; no exigir cookie.
3. Con todo QA en PASS, crear backup e imagen de rollback.
4. Desplegar exactamente `b6b51b0bc637e1b8504c0964c985f37ab96f67d0`.
5. Ejecutar el smoke estricto de cookie contra producción ya actualizada.
6. Si falla el smoke post-deploy, hacer rollback inmediato.

El token Bearer legacy no puede sustituir la validación de cookie del candidato.

## Funcionalidad incluida

- Hardening transaccional, locks e idempotencia para operaciones de taller.
- Protección contra stock negativo y doble consumo.
- Sesión browser mediante cookie `HttpOnly`; eliminación de token en `localStorage`.
- Headers de seguridad y autorización Telegram por chat/usuario.
- Captura conversacional para pedido, cliente, compra, gasto y ajuste.
- Preguntas legibles para datos faltantes o ambiguos y bloqueo de confirmación hasta aclararlos.
- Smoke auth con extracción de `Set-Cookie`, `rawHeaders` y representaciones combinadas.

## QA existente

- OpenClaw ya confirmó 51/51 tests, lint, typecheck, build, 0 vulnerabilidades.
- Migraciones: 15/15 desde cero, idempotencia y copia de producción PASS.
- E2E, concurrencia, stock negativo y Docker PASS.
- Falta repetir el flujo con el smoke cookie en el entorno correcto y, si pasa, desplegar.

## Próximos pasos

1. Ejecutar el prompt actualizado de OpenClaw sobre b6b51b0.
2. Con deploy PASS, probar login/cookie real y activar Telegram con secretos privados.
3. Implementar conversación multi-turno real sin duplicados.
4. Evaluar WhatsApp cuando exista contacto con la usuaria.

## Documentos

- `docs/openclaw-qa-prompt.md`: prompt compacto para Telegram.
- `docs/openclaw-qa-operations-prompt.md`: procedimiento detallado.
- `docs/qa-pendiente.md`: gates y pendientes.
- `docs/roadmap.md`: roadmap funcional.
