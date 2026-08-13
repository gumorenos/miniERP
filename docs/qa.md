# QA

Required gates:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- migration against a test PostgreSQL database
- container health checks
- `npm run test:e2e`

The E2E flow covers customer creation, order creation, deposit, cut stock deduction exactly once, embroidery send/receive, overdue embroidery derivation, final payment history, delivery/close and margin calculation.

## Development QA

The development Compose stack may use the normal demo seed and must never contain real customer data.

## Production-like isolated QA

Production intentionally does not run demo seed data. For a disposable isolated QA database, use the dedicated one-shot fixture service instead of enabling the development seed.

Sequence:

1. Start `compose.prod.yml` with a new project/volume and temporary secrets.
2. Create the QA user:

```sh
docker compose --env-file .env.production -f compose.prod.yml --profile ops run --rm bootstrap-user
```

3. Seed disposable E2E fixtures only after explicitly acknowledging the isolated database:

```sh
E2E_FIXTURES_CONFIRM=isolated-qa-db \
  docker compose --env-file .env.production -f compose.prod.yml --profile qa run --rm qa-fixtures
```

4. Run the API flow against the localhost-bound app:

```sh
E2E_BASE_URL=http://127.0.0.1:${APP_HOST_PORT} npm run test:e2e
```

The fixture service refuses to run unless `E2E_FIXTURES_CONFIRM=isolated-qa-db`, requires the target application user to exist, and refuses to seed a business that already contains products, materials or orders. Never run it against a real pilot database.

## Authentication QA

For pilot hardening validate at minimum:

- passwords are `scrypt` hashes, not plaintext;
- bearer tokens are stored only as SHA-256 hashes;
- sessions persist across app restarts;
- logout marks the session revoked;
- expired and disabled-user sessions return 401;
- password rotation marks all active sessions revoked and preserves their rows for audit;
- old password and old sessions fail after rotation;
- the long-running app container does not receive bootstrap credentials.
