# VPS Deployment Strategy

## Target

Deploy miniERP on the existing Oracle VPS using Docker Compose.

## Services

The first deployment should contain only:

1. `app` — web UI and API.
2. `postgres` — application database.
3. `backup` — scheduled PostgreSQL dumps or an equivalent host-side backup job.

Do not add Redis, queues, object storage, reverse proxies inside Docker, or other infrastructure unless a concrete requirement appears.

## Public access

Preferred initial order:

1. Reuse the user's existing Cloudflare setup.
2. Prefer Cloudflare Tunnel if it is already operational on the server and can expose the service cleanly.
3. Otherwise use Cloudflare DNS/proxy with a host reverse proxy and TLS.

The database must never be publicly exposed.

## Suggested filesystem layout

```text
/srv/minierp/
  compose.yml
  .env
  backups/
  data/
```

Repository checkout may live in a separate working directory used by OpenClaw for deployment.

## Environment separation

At minimum maintain:

- local/dev environment
- VPS production environment

A staging deployment is optional for the first MVP. If OpenClaw can safely run an ephemeral candidate container on a separate port or hostname, use that for release validation before replacing production.

## Deployment workflow

1. Fetch the intended commit/branch.
2. Verify clean working tree and exact commit SHA.
3. Build images from repository Dockerfiles.
4. Run automated tests and build checks.
5. Back up PostgreSQL before schema-changing releases.
6. Apply database migrations exactly once.
7. Start/update containers with Docker Compose.
8. Run health checks.
9. Run smoke tests against the public or candidate URL.
10. Record deployed commit SHA and migration version.

## Database backups

Initial requirement:

- daily PostgreSQL logical backup
- retain multiple recent copies, not only the latest file
- backups stored outside the PostgreSQL container volume
- periodically prove that a backup can be restored into a disposable database

For an MVP, a simple `pg_dump` rotation is acceptable. Backup success without restore testing is not considered sufficient long-term.

## Rollback

Application rollback:

- redeploy the previous known-good commit/image.

Database rollback:

- prefer forward-fix migrations.
- do not automatically reverse destructive migrations.
- before any destructive schema change, create and verify a fresh backup.

## Secrets

Never commit production values. `.env` must be gitignored. OpenClaw may inspect that required variable names exist but should not print secret values into chat, logs, commits, or PRs.

## Production hardening baseline

Before real customer data is entered:

- authentication enabled
- strong session secret
- PostgreSQL not internet-accessible
- HTTPS only
- secure cookies
- input validation server-side
- database migrations versioned
- automated backups enabled
- restore procedure tested
- container restart policy configured
- basic health endpoint available
- no development/debug endpoints exposed
