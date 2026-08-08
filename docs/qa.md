# QA

Required gates for Phase 1:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- migration against a test PostgreSQL database
- `docker compose up --build`
- `curl http://localhost:3000/api/health`
- `npm run test:e2e`

The e2e flow covers: customer creation, order creation, deposit, cut stock deduction exactly once, embroidery send/receive, overdue embroidery derivation, final payment history, delivery/close and margin calculation.

