# Authentication

Pilot authentication uses two layers:

1. Cloudflare Access protects the pilot hostname at the edge.
2. miniERP authenticates the application user with a salted Node `scrypt` password hash and a revocable database session.

## Session model

- Login returns a random 256-bit bearer token.
- Only the SHA-256 hash of that token is stored in PostgreSQL.
- Sessions expire after `SESSION_TTL_DAYS` (30 days by default).
- Restarting the app does not invalidate a valid session.
- `POST /api/auth/logout` revokes the current session by setting `revoked_at`.
- Disabled users cannot use existing sessions.
- Revoked session rows are retained for audit/history instead of being deleted.

## Temporary first-login password

Production bootstrap credentials are temporary by default. `APP_USER_FORCE_PASSWORD_CHANGE` defaults to `true` in the production Compose profile.

When that flag is true:

- the bootstrap command marks the account as requiring a password change;
- a successful login can access only the session/logout/password-change endpoints;
- operational API calls return HTTP 428 with `PASSWORD_CHANGE_REQUIRED`;
- the browser redirects to `/change-password.html`;
- saving a new password clears the requirement, revokes all existing sessions and requires a fresh login;
- the temporary password no longer works after the change.

For disposable automated QA only, the bootstrap flag may explicitly be set to `false` on an isolated database so the existing E2E order flow can run without an interactive password-change step.

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
- `APP_USER_FORCE_PASSWORD_CHANGE` (`true` for the real pilot)

The command is idempotent by email. If the user already exists, it rotates the password, reactivates the account and marks all currently active sessions revoked. It does not create another business and it preserves revoked session rows for audit.

The bootstrap container exits after the operation, so the application container does not retain the bootstrap password in its environment. Once the tester has changed the temporary password, remove or blank `APP_USER_PASSWORD` from the server env file until an administrator intentionally needs another reset.

## Development migration

When development seed encounters an old demo user whose password was stored in plaintext by Phase 1, it upgrades that password to `scrypt` automatically. Production never accepts plaintext/legacy hashes.

## Dev endpoint

`POST /api/dev/seed` returns 404 when `NODE_ENV=production` and never executes seed logic.
