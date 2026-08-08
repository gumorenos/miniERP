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
- The long-running app container does not receive the bootstrap user password.
- Secrets live only in the server-side env file and must not be committed. Set restrictive filesystem permissions on this file.

Recommended exposure path:

`Internet -> Cloudflare Access/Tunnel -> 127.0.0.1:${APP_HOST_PORT} -> miniERP app -> private Docker network -> PostgreSQL`

For the first pilot, protect the hostname with Cloudflare Access so only the intended tester can reach the app. Do not open the application or PostgreSQL port directly in the VPS firewall.

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

This same command can later rotate that user's password. Password rotation revokes all existing application sessions for that user.

7. Verify locally on the VPS:

```bash
curl -fsS http://127.0.0.1:${APP_HOST_PORT}/api/health
```

8. Verify login locally, then configure Cloudflare Tunnel and Access.
9. Only after local health/login passes, attach the protected hostname.
10. Run the smoke/E2E checklist against the protected hostname.

### Upgrade procedure

1. Confirm the exact validated commit and a clean working tree.
2. Back up PostgreSQL before applying new migrations.
3. Pull/checkout the validated commit.
4. Run code QA gates.
5. Rebuild/restart with `compose.prod.yml`; migrations run before the app starts.
6. Confirm both services healthy and run local smoke tests.
7. Confirm the protected hostname after local validation.

### Rollback

Keep the previous image/commit identifiable before upgrades. If a release fails after migration, stop the new app, restore the database backup when required, checkout the previous validated commit, rebuild and re-run health/login checks before restoring traffic.

## Authentication / exposure policy

Application auth now uses salted `scrypt` password hashes and persistent revocable sessions. Cloudflare Access remains required for the first pilot as defense in depth and to keep the pilot URL restricted to the intended tester.
