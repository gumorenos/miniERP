# Authentication

Pilot authentication uses two layers:

1. Cloudflare Access protects the pilot hostname at the edge.
2. miniERP authenticates the application user with a salted Node `scrypt` password hash and a revocable database session.

## Session model

- Login returns a random 256-bit bearer token.
- Only the SHA-256 hash of that token is stored in PostgreSQL.
- Sessions expire after `SESSION_TTL_DAYS` (30 days by default).
- Restarting the app does not invalidate a valid session.
- `POST /api/auth/logout` revokes the current session.
- Disabled users cannot use existing sessions.

## First pilot user / password rotation

Production does not run demo seed data. The regular `app` service intentionally does **not** receive `APP_USER_PASSWORD`.

After migrations and the database service are available, create the initial user with the one-shot operations service:

```sh
docker compose --env-file .env.production -f compose.prod.yml --profile ops run --rm bootstrap-user
```

Required values in the server-local `.env.production` file:

- `APP_USER_EMAIL`
- `APP_USER_PASSWORD` (minimum 12 characters)
- `APP_BUSINESS_NAME`

The command is idempotent by email. If the user already exists, it rotates the password, reactivates the account and revokes all existing sessions. It does not create another business.

The bootstrap container exits after the operation, so the application container does not retain the bootstrap password in its environment.

## Development migration

When development seed encounters an old demo user whose password was stored in plaintext by Phase 1, it upgrades that password to `scrypt` automatically. Production never accepts plaintext/legacy hashes.

## Dev endpoint

`POST /api/dev/seed` returns 404 when `NODE_ENV=production` and never executes seed logic.
