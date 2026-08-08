# QA and Release Gates

OpenClaw on the VPS may be used to execute deployment and QA, but release decisions must be based on repeatable checks rather than visual inspection alone.

## Gate 1 — repository integrity

Before testing or deploying:

- exact repository is `gumorenos/miniERP`
- intended branch/commit is identified
- working tree is clean or local changes are explicitly understood
- no secrets are tracked

## Gate 2 — static and build checks

Required once the scaffold exists:

- dependency installation succeeds from lockfile
- TypeScript typecheck passes
- lint passes
- production build passes
- automated tests pass
- dependency audit has no unresolved release-blocking high/critical issues, with findings reviewed rather than blindly auto-fixed

## Gate 3 — database checks

- migrations apply successfully to a clean database
- migrations apply successfully from the previous supported schema
- seed/demo data is never applied accidentally to production
- order, payment, stock, and cost constraints are enforced server-side

## Gate 4 — core workflow tests

The first release is not acceptable until this scenario works end-to-end:

1. Create a customer.
2. Create an order for a named model, size and color.
3. Record an advance payment via Yape or Plin.
4. Cut the material and verify the stock movement.
5. Send the cut piece to the embroiderer and record promised return date/cost.
6. Receive the embroidery and record actual cost.
7. Advance the order through assembly/confection.
8. Record final payment.
9. Mark delivered/closed.
10. Verify outstanding balance is zero and estimated/actual margin is consistent.

Also test a sale from finished-goods stock without production.

## Gate 5 — operational edge cases

At minimum cover:

- XL/XXL price adjustment
- insufficient material stock
- embroidery delay
- actual embroidery cost different from estimate
- multiple partial payments
- payment greater than remaining balance is rejected or explicitly handled
- order cancelled before and after material consumption
- inventory adjustment with reason/audit trail
- material price changes between purchases
- finished garment reserved then sold

## Gate 6 — responsive UI

The owner is expected to use the system heavily from a phone. Validate at common mobile widths that:

- primary actions are reachable without horizontal scrolling
- forms are usable with touch input
- urgent orders are visible immediately
- monetary values and statuses remain readable
- destructive actions require clear confirmation

## Gate 7 — production smoke test

After deployment:

- health endpoint returns success
- login works
- dashboard loads
- database read/write works
- one non-destructive test record can be created and removed or a dedicated smoke path is used
- no server errors appear in application logs
- public endpoint uses HTTPS

## Release evidence

For every deployed release, OpenClaw should report:

- commit SHA
- deployment date/time
- migration version
- checks executed and result
- public/candidate URL tested
- backup status when schema changes occurred
- known non-blocking issues

A release with a failing required gate must be reported as NOT READY rather than deployed silently.
