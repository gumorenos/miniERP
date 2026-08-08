# Initial Architecture

## Goal

Ship a small, reliable, mobile-first mini ERP for a single-owner clothing workshop while keeping the system portable enough to evolve into a multi-business SaaS later.

## Deployment target

The first production target is the existing Oracle VPS.

```text
Internet
  |
Cloudflare
  |
VPS
  |
Docker Compose
  |-- app
  |-- postgres
  `-- backup
```

Cloudflare provides the public DNS/proxy layer. The application and database run on the VPS. Cloudflare Tunnel may be used instead of exposing the application container directly.

## Application shape

Use a modular monolith, not microservices.

Recommended initial stack:

- TypeScript
- React
- Vite
- Hono for the HTTP/API layer
- PostgreSQL
- Drizzle ORM
- Zod validation
- Tailwind CSS or an equivalent lightweight component system
- Docker Compose for local and VPS deployment

The frontend and backend may live in a single repository and be deployed as one application container. The database runs separately in PostgreSQL.

## Core architectural rules

1. All business records belong to a `business_id`, even though the MVP has one business and one user.
2. Inventory quantities are derived from immutable stock movements. Never silently overwrite stock as the primary source of truth.
3. Payments are individual transactions. Never store only a paid/unpaid flag.
4. Estimated and actual costs are stored separately.
5. Order status changes are historized.
6. Cutting material creates the inventory consumption movement.
7. Embroidery work is a first-class production record, not a generic expense.
8. Financial reporting is managerial, not statutory accounting.
9. All destructive or financially relevant future WhatsApp/AI actions must require validation before persistence unless a rule is explicitly proven safe.
10. Secrets are supplied only through environment variables or secret stores and never committed.

## MVP modules

- Dashboard
- Customers
- Products/models and size pricing
- Orders
- Production and embroidery tracking
- Materials inventory
- Finished-goods inventory
- Purchases
- Payments
- Expenses
- Costing and basic profitability

## Out of scope for the first production version

- SUNAT accounting/tax declarations
- Electronic invoicing
- Native mobile apps
- OCR
- Voice ingestion
- WhatsApp automation
- Instagram integration
- Multi-warehouse inventory
- Complex permissions
- Advanced accounting

## Future integration boundary

WhatsApp should later enter through a dedicated webhook endpoint and an inbox/pending-action layer:

```text
WhatsApp -> webhook -> parser/AI -> pending action -> user confirmation -> domain service -> PostgreSQL
```

AI must not directly mutate inventory, orders, payments, or expenses.

## Portability

Environment-specific values must be configured through variables such as:

- `DATABASE_URL`
- `APP_URL`
- `SESSION_SECRET`
- `CLOUDFLARE_TUNNEL_TOKEN` when applicable
- future `WHATSAPP_*` secrets
- future `OPENROUTER_API_KEY`

The application should not depend on VPS-specific filesystem state except explicitly mounted persistent volumes and backup paths.
