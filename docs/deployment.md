# Deployment

Production deployment is intentionally not part of Phase 1.

Local Docker run:

1. Copy `.env.example` to `.env` if running outside Compose.
2. Start the stack with `docker compose up --build`.
3. Open `http://localhost:3001`.

The Compose service runs migrations and development seed data automatically. Do not use real data in this stack yet.
