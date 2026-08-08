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
- Secrets live only in the server-side env file and must not be committed.

Recommended exposure path:

`Internet -> Cloudflare Access/Tunnel -> 127.0.0.1:${APP_HOST_PORT} -> miniERP app -> private Docker network -> PostgreSQL`

For the first pilot, protect the hostname with Cloudflare Access so only the intended tester can reach the app. Do not open the application or PostgreSQL port directly in the VPS firewall.

### Deploy procedure

1. Confirm branch/commit to deploy and clean working tree.
2. Back up the PostgreSQL volume/database if this is an upgrade.
3. Create/update `.env.production` with strong unique secrets.
4. Run QA gates before deployment.
5. Build and start:

```bash
docker compose --env-file .env.production -f compose.prod.yml up --build -d
```

6. Wait until both services report healthy.
7. Verify locally on the VPS:

```bash
curl -fsS http://127.0.0.1:${APP_HOST_PORT}/api/health
```

8. Only after local health passes, connect the Cloudflare Tunnel/Access hostname.
9. Run the smoke/E2E checklist against the protected hostname.

### Rollback

Keep the previous image/commit identifiable before upgrades. If a release fails after migration, stop the new app, restore the database backup when required, checkout the previous validated commit, rebuild and re-run the health checks.

## Current authentication caveat

Phase 1 application authentication is still MVP-grade. The pilot hostname MUST therefore remain behind Cloudflare Access until application-level password hashing and persistent sessions are implemented and validated. Cloudflare Access is a defense-in-depth requirement for the pilot, not a replacement for the planned application-auth hardening.
