# Initial Domain Model

This document is implementation-oriented but intentionally database-agnostic.

## Core ownership

### Business

- id
- name
- created_at
- updated_at

### User

- id
- business_id
- name
- email/login identifier
- active

The MVP exposes only one user, but all operational entities should belong to a business so future multi-business support does not require a domain rewrite.

## Customer

- id
- business_id
- name
- phone nullable
- instagram_handle nullable
- notes nullable
- created_at
- updated_at

## Product

Represents a named model such as `Vestido X`.

- id
- business_id
- name
- type: DRESS | SKIRT | JACKET | OTHER
- base_sale_price
- default_fabric_material_id nullable
- default_fabric_qty_meters nullable
- default_closure_material_id nullable
- default_closure_qty nullable
- default_embroidery_cost nullable
- default_own_labor_cost nullable
- default_packaging_material_id nullable
- default_packaging_qty nullable
- active
- notes nullable

## ProductSizePrice

- id
- product_id
- size: S | M | L | XL | XXL
- price_adjustment
- optional fixed_price override

Business rule: XL/XXL pricing is configurable and not hard-coded.

## Material

- id
- business_id
- name
- category: FABRIC | CLOSURE | THREAD | PACKAGING | OTHER
- unit: METER | EACH | SPOOL | OTHER
- color nullable
- minimum_stock nullable
- active

Current quantity and weighted-average value are derived from stock movements/receipts rather than treated as an independently editable source of truth.

## Purchase

- id
- business_id
- purchase_date
- supplier_name nullable
- total_amount
- payment_method nullable
- notes nullable

## PurchaseLine

- id
- purchase_id
- material_id
- quantity
- total_cost
- unit_cost derived/stored for audit convenience

Creating/finalizing a purchase line generates an incoming stock movement.

## StockMovement

- id
- business_id
- material_id
- occurred_at
- type: PURCHASE | ORDER_CONSUMPTION | ADJUSTMENT_IN | ADJUSTMENT_OUT | RETURN
- quantity_signed
- unit_cost nullable
- purchase_line_id nullable
- order_item_id nullable
- notes nullable

Stock on hand = sum(quantity_signed) per material.

## Order

- id
- business_id
- order_number
- customer_id
- order_date
- promised_delivery_date nullable
- fulfillment_type: MADE_TO_ORDER | FROM_STOCK
- status
- agreed_total_price
- notes nullable
- delivered_at nullable
- closed_at nullable
- created_at
- updated_at

Recommended made-to-order statuses:

- ORDER_RECEIVED
- MATERIAL_PENDING
- READY_TO_CUT
- CUT
- AT_EMBROIDERER
- EMBROIDERY_RECEIVED
- ASSEMBLY
- READY_FOR_DELIVERY
- DELIVERED
- CLOSED
- CANCELLED (reserved from the start even if cancellation UX is deferred)

## OrderItem

MVP may initially enforce one garment per order in the UI, but the data model should allow multiple items without redesign.

- id
- order_id
- product_id
- size
- color
- quantity
- agreed_unit_price
- fabric_material_id nullable
- planned_fabric_qty nullable
- actual_fabric_qty nullable
- estimated_material_cost nullable
- actual_material_cost nullable
- estimated_own_labor_cost nullable
- actual_own_labor_cost nullable
- estimated_packaging_cost nullable
- actual_packaging_cost nullable
- other_estimated_direct_cost nullable
- other_actual_direct_cost nullable

When an item is marked CUT, its actual/planned fabric consumption generates an ORDER_CONSUMPTION stock movement exactly once.

## OrderStatusHistory

- id
- order_id
- from_status nullable
- to_status
- changed_at
- note nullable

Every state transition is append-only for traceability.

## EmbroideryProvider

- id
- business_id
- name
- phone nullable
- active
- notes nullable

## EmbroideryJob

- id
- business_id
- order_item_id
- provider_id
- status: PLANNED | SENT | RECEIVED | CANCELLED
- sent_at nullable
- expected_return_date nullable
- received_at nullable
- estimated_cost nullable
- actual_cost nullable
- notes nullable

Derived overdue days should not be persisted unless needed for analytics; calculate it from expected_return_date and received/status.

## Payment

- id
- business_id
- order_id
- paid_at
- amount
- method: YAPE | PLIN | CASH | BANK_TRANSFER | OTHER
- notes nullable

Order total paid = sum(payment.amount).
Order balance = agreed_total_price - total paid.
Payment status is derived.

## Expense

- id
- business_id
- expense_date
- category: PACKAGING | DELIVERY | TRANSPORT | ADVERTISING | UTILITIES | INDIRECT_MATERIAL | OTHER
- description
- amount
- payment_method nullable
- order_id nullable
- notes nullable

Avoid double-counting: a direct order cost should either be represented as an attributable order cost or a general expense according to the chosen reporting rule, not counted in both margin and monthly expenses.

## FinishedGoodStock

For the MVP, this can be represented either by explicit finished-goods movements or a compact inventory table. Prefer movements if implementation cost remains reasonable.

Minimum identity dimensions:

- business_id
- product_id
- size
- color

Required capabilities:

- add finished unit(s) to stock;
- reserve/release if reservation is enabled;
- reduce stock when sold;
- preserve traceability of adjustments.

## Reporting definitions

### Sales agreed

Sum of agreed order values for the selected order-date/reporting convention. The UI should label the convention clearly.

### Cash collected

Sum of payments received in the selected period.

### Accounts receivable

Sum of positive outstanding balances on non-cancelled orders.

### Order contribution margin

Agreed sale value minus attributable actual costs when known, falling back to estimated costs for unfinished operations if the dashboard explicitly labels the metric as estimated.

### Approximate managerial result

Order contribution margin for the selected period minus general expenses under the chosen reporting convention.

This is managerial/reference information, not statutory accounting profit.

## Critical invariants

1. Never directly overwrite material stock as the normal workflow; create a stock movement.
2. A cut operation may consume a given order item's fabric only once unless a correction/return movement is explicitly created.
3. Never replace payment history with a single paid/unpaid flag.
4. Closed/delivered orders retain their cost and payment history.
5. Historical purchase prices are immutable once finalized except through an auditable correction path.
6. Embroidery expected vs actual return dates must remain separately available.
7. Estimated and actual costs must not overwrite each other.
