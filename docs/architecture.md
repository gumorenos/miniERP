# Architecture

miniERP Phase 1 is a modular monolith:

- `src/client`: React + Vite mobile-first UI.
- `src/server`: Hono HTTP app and API routes.
- `src/db`: PostgreSQL connection, Drizzle schema and migration runner.
- `src/domain`: pure domain rules and tests.

The MVP keeps a single-user login but every operational table carries `business_id` where required by the domain model. Material stock is derived from `stock_movements`; payments are append-only rows.

