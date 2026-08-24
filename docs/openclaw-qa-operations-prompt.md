# OpenClaw — QA y deploy condicionado de miniERP

## Contexto

miniERP/Samiiwara es una aplicación para gestionar un taller. ChatGPT desarrolla; OpenClaw únicamente ejecuta testing, QA, backups y despliegue condicionado. No modificar código ni integrar OpenClaw al runtime.

## Candidato exacto

- Repositorio: `gumorenos/miniERP`.
- Rama de referencia: `qa/miniERP-auth-cookie-fix-v2`.
- SHA funcional exacto: `b6b51b0bc637e1b8504c0964c985f37ab96f67d0`.
- Producción previa: `de5d3f6f5f088421fee8f3030652808076965656`.
- URL pública: `https://prueba.gumorenos.space`.
- VPS: `/home/ubuntu/apps/minierp-samiiwara`.

## Diagnóstico confirmado

El commit productivo `de5d3f6…` implementa login con token JSON/Bearer y cliente con token en `localStorage`. Su endpoint de login no agrega `Set-Cookie`.

El candidato `b6b51b0…` agrega `minierp_session`, autenticación web mediante cookie `HttpOnly`, login `private, no-store`, mejoras de seguridad/concurrencia y seguimiento conversacional.

Por ello, ejecutar el smoke nuevo que exige cookie contra producción antigua antes del deploy produce siempre `AUTH_COOKIE_MISSING`. No es un fallo del candidato: es un gate circular.

## Verificación Git

```bash
git fetch origin refs/heads/qa/miniERP-auth-cookie-fix-v2:refs/remotes/origin/qa/miniERP-auth-cookie-fix-v2
git cat-file -t b6b51b0bc637e1b8504c0964c985f37ab96f67d0
git merge-base --is-ancestor b6b51b0bc637e1b8504c0964c985f37ab96f67d0 refs/remotes/origin/qa/miniERP-auth-cookie-fix-v2
git checkout --detach b6b51b0bc637e1b8504c0964c985f37ab96f67d0
test "$(git rev-parse HEAD)" = "b6b51b0bc637e1b8504c0964c985f37ab96f67d0"
```

Si cualquier verificación falla: STOP. No usar HEAD ni otro SHA como fallback.

## Gates previos al deploy

En worktree y PostgreSQL aislados:

1. `npm ci`.
2. `npm run qa`.
3. Migraciones desde cero y segunda ejecución idempotente.
4. Migraciones sobre copia de producción.
5. `npm run test:e2e`.
6. Concurrencia/idempotencia de compras, gastos, ajustes, corte, bordado, ensamblaje y entrega.
7. Rechazo de stock negativo.
8. Callbacks Telegram simulados.
9. Docker build.
10. Arrancar la aplicación del candidato exacto en un puerto de QA con base aislada o copia productiva.
11. Ejecutar `npm run smoke:auth` contra esa instancia usando una cuenta válida del entorno aislado. Exigir `AUTH_SMOKE_PASS`, cookie `minierp_session`, sesión y acceso a bootstrap.

El token Bearer legacy nunca sustituye el smoke de cookie del candidato.

## Verificación de producción antigua

Antes del deploy:

- `/api/health` debe devolver 200.
- La cuenta productiva puede verificarse con el mecanismo legacy vigente si existe autorización y credenciales privadas.
- El login 200 sin `Set-Cookie` es esperado en `de5d3f6…`; no detener el deploy por esa ausencia.
- Nunca imprimir credenciales, cookies o tokens.

## Deploy y gate post-deploy

Solo con todos los gates aislados en PASS:

1. Crear backup PostgreSQL.
2. Etiquetar imagen/commit anterior para rollback.
3. Desplegar exactamente `b6b51b0bc637e1b8504c0964c985f37ab96f67d0`.
4. Aplicar migraciones productivas.
5. Verificar contenedor healthy y health local/público 200.
6. Ejecutar `npm run smoke:auth` contra producción HTTPS.
7. Exigir `AUTH_SMOKE_PASS` y cookie válida.
8. Si falla health, login/cookie/session/bootstrap o cualquier verificación post-deploy, ejecutar rollback inmediato al SHA previo y reportar el estado final.

## Reporte

PASS/FAIL, SHA probado/desplegado, QA, migraciones, E2E, concurrencia, Docker, smoke auth del candidato aislado, smoke auth productivo post-deploy, backup, imagen de rollback, health y bloqueos.
