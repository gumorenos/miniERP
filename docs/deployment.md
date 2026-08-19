# Deployment

## Development

Use `compose.yml` only for local/isolated QA. It runs migrations and demo seed data automatically.

```bash
docker compose up --build
```

The development stack must never contain real customer data.

## Pilot / production-like VPS deployment

Use `compose.prod.yml` with a server-local `.env.production` created from `.env.production.example`.

Key properties:

- PostgreSQL is not published on a host port.
- The app binds only to `127.0.0.1` on the VPS.
- Demo seed does not run.
- Database migrations run before app startup.
- PostgreSQL and the app both have healthchecks.
- Containers restart unless stopped explicitly.
- Application sessions are persistent, expiring and revocable in PostgreSQL.
- The long-running app container does not receive bootstrap user credentials.
- Secrets live only in the server-side env file and must not be committed. Set restrictive filesystem permissions on this file.

Current exposure path:

`Internet -> Cloudflare Tunnel -> 127.0.0.1:${APP_HOST_PORT} -> miniERP app -> private Docker network -> PostgreSQL`

The current pilot relies on application authentication plus login rate limiting. Do not open the application or PostgreSQL port directly in the VPS firewall.

### Telegram capture

Telegram será una integración directa de miniERP mediante la API oficial del bot. El token vivirá únicamente en el entorno del servidor; el adaptador validará webhook, chat/usuario autorizado e idempotencia antes de crear borradores. OpenClaw no participa en el runtime funcional: queda limitado a testing, QA y despliegue. Activar Telegram solo después de QA aislado.

### Cloudflare Access — PENDING

Cloudflare Access is intentionally **not enabled yet** for the current pilot, but it remains a pending defense-in-depth item and must not be removed from the roadmap. Before the pilot is widened to more users or treated as a longer-lived external service, evaluate and enable Cloudflare Access in front of the hostname unless there is a documented reason not to.

Enabling Access later must preserve application authentication rather than replace it.

### Initial deploy procedure

1. Confirm branch/commit to deploy and clean working tree.
2. Create `.env.production` with strong unique secrets and set restrictive permissions (for example `chmod 600 .env.production`).
3. Run QA gates before deployment.
4. Build and start the application/database:

```bash
docker compose --env-file .env.production -f compose.prod.yml up --build -d
```

5. Wait until both `db` and `app` report healthy.
6. Create the initial application user with the ephemeral operations service:

```bash
docker compose --env-file .env.production -f compose.prod.yml --profile ops run --rm bootstrap-user
```

`APP_USER_EMAIL` and `APP_USER_PASSWORD` are bootstrap/emergency inputs, not the permanent source of truth for the account. The account in PostgreSQL is authoritative and the user can change name, email and password inside the application.

7. Store the real password in a password manager. After the initial bootstrap, blank **both** `APP_USER_EMAIL` and `APP_USER_PASSWORD` in the real server env and keep its restrictive permissions. Do not try to keep `APP_USER_EMAIL` synchronized with later self-service email changes.
8. For a future emergency credential reset, set the current account email/password explicitly for that one-shot operation, run `bootstrap-user`, verify access, and blank the bootstrap fields again. Routine account changes must use the application instead.
9. Verify locally on the VPS:

```bash
curl -fsS http://127.0.0.1:${APP_HOST_PORT}/api/health
```

10. Verify login locally, then confirm the Cloudflare Tunnel route.
11. Only after local health/login passes, attach or update the hostname.
12. Run smoke checks against the hostname.
13. When Cloudflare Access is enabled later, add an Access-specific smoke check without removing the application-login smoke.

### Production-like E2E QA

Never enable the development seed in production. For a disposable isolated QA database only, create the QA user with `bootstrap-user` and then seed the dedicated E2E fixtures:

```bash
E2E_FIXTURES_CONFIRM=isolated-qa-db \
  docker compose --env-file .env.production -f compose.prod.yml --profile qa run --rm qa-fixtures
```

The fixture service refuses to run without that exact confirmation, requires the target user to exist, and refuses to seed a business that already contains products, materials or orders. Never execute it against the real pilot database.

Then run:

```bash
E2E_BASE_URL=http://127.0.0.1:${APP_HOST_PORT} npm run test:e2e
```

### Upgrade procedure

1. Confirm the exact validated commit and a clean working tree.
2. Back up PostgreSQL before applying new migrations.
3. Pull/checkout the validated commit.
4. Run code QA gates.
5. Rebuild/restart with `compose.prod.yml`; migrations run before the app starts.
6. Confirm both services healthy and run local smoke tests.
7. Confirm the external hostname after local validation.

### Rollback

Keep the previous image/commit identifiable before upgrades. If a release fails after migration, stop the new app, restore the database backup when required, checkout the previous validated commit, rebuild and re-run health/login checks before restoring traffic.

## Authentication / exposure policy

Application auth uses salted `scrypt` password hashes, persistent revocable sessions and application-level login rate limiting. Cloudflare Access remains a pending defense-in-depth control for the pilot; when enabled, it must sit in front of — not replace — the application authentication layer.
