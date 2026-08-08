# AGENTS.md

This repository implements a small, mobile-first ERP for an independent clothing workshop. Read `docs/mvp-spec.md`, `docs/domain-model.md`, `docs/architecture.md`, `docs/deployment.md`, and `docs/qa.md` before making architectural or domain changes.

## Product priorities

1. Urgent order visibility.
2. Embroidery tracking and overdue work.
3. Material and finished-goods stock accuracy.
4. Sales, collections, costs, expenses, and approximate managerial profit.
5. Fast mobile data entry.

## Domain invariants

- Inventory source of truth is stock movement history.
- Material is consumed at cutting.
- Payments are append-only transactions; totals are derived.
- Estimated and actual costs remain separate.
- Order status changes are historized.
- Embroidery is a dedicated workflow record.
- A product uses one fabric type/color in the MVP.
- Standard sizes are S, M, L, XL, XXL; pricing adjustments must be configurable, not hard-coded.
- Current payment methods include Yape and Plin; the model may also support cash, transfer, and other.
- Financial reporting is managerial and must not be represented as formal statutory accounting.

## Architecture guardrails

- Modular monolith only for the MVP.
- TypeScript across app/API unless a documented decision changes this.
- PostgreSQL is the production database.
- Docker Compose is the VPS deployment mechanism.
- Every business-owned record carries `business_id` even while only one business/user exists.
- Validate external input server-side.
- Never commit `.env`, secrets, real customer data, database dumps, tokens, or production backups.
- Do not add Redis, queues, microservices, Kubernetes, object storage, or heavy infrastructure without an explicit requirement.

## Delivery approach

Build vertical slices rather than disconnected CRUD screens. The first vertical slice is:

customer -> order -> advance -> cutting/stock consumption -> embroidery send/receive -> confection -> final payment -> delivery -> actual margin

A slice is not complete until its relevant automated tests and the QA gates in `docs/qa.md` pass.

## OpenClaw deployment behavior

When running on the VPS:

- report exact branch and commit SHA before deployment;
- do not overwrite unrelated local changes;
- do not print secret values;
- back up the production database before schema-changing production releases;
- run tests/build before deployment;
- run post-deploy health/smoke checks;
- report NOT READY and stop before production deployment when a required release gate fails;
- never run destructive production database commands unless explicitly requested and backed up.

## Scope discipline

Do not implement WhatsApp, AI ingestion, OCR, Instagram, SUNAT, electronic invoicing, native mobile apps, advanced permissions, or multi-warehouse features in the initial slice unless the product specification is explicitly changed.
