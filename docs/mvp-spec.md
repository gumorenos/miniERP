# MVP Functional Specification

## 1. Scope

The MVP must answer four operational questions quickly:

1. What orders are pending, due soon, or late?
2. What is currently with the embroidery provider and what is late?
3. What raw materials and finished garments are in stock?
4. How much has the business sold, collected, spent, and approximately earned?

Out of scope for MVP: formal accounting, SUNAT, electronic invoicing, OCR, AI, WhatsApp automation, Instagram integration, native mobile apps, complex permissions, multiple warehouses.

## 2. User

Single business owner/operator. She cuts and assembles garments herself and outsources embroidery.

## 3. Product catalog

Typical product types:

- Dress
- Skirt
- Jacket
- Other

Each model has a stable name, for example `Vestido X` or `Falda Y`.

### Sizes

- S
- M
- L
- XL
- XXL

XL and XXL may have a higher sales price. Size adjustments must be configurable, never hard-coded.

### Product fields

- Name
- Product type
- Active/inactive
- Base sale price
- Default fabric consumption (meters)
- Default closure quantity
- Default embroidery estimated cost
- Default own-labor estimated cost
- Default packaging quantity
- Optional notes

Reference example only, editable per model/order:

- Basic dress sale price: S/ 320
- Fabric: ~1 m
- Fabric reference cost: S/ 16/m
- Closure: 1 × S/ 1.50
- Embroidery: ~S/ 80, variable by complexity
- Own labor: ~S/ 15
- Packaging: 1 paper bag, ~S/ 2

## 4. Customers

Minimum fields:

- Name
- Phone (optional)
- Instagram handle (optional)
- Notes (optional)

A customer may have multiple orders.

## 5. Orders

An order may be either:

- made-to-order; or
- fulfilled from finished-goods stock.

### Core fields

- Order number
- Customer
- Order date
- Promised delivery date
- Fulfillment type: `MADE_TO_ORDER` / `FROM_STOCK`
- Product/model
- Size
- Color
- Quantity
- Agreed sale price
- Notes

Each garment uses one fabric type and one color in the MVP.

### Payment data

Payments are individual transactions. The order displays:

- Agreed price
- Total paid
- Outstanding balance
- Payment status derived from transactions

Supported payment methods initially:

- Yape
- Plin
- Cash
- Bank transfer
- Other

No fixed deposit percentage is required. Deposits may be S/ 50, S/ 100, 50%, or another agreed amount.

## 6. Made-to-order production states

Initial state machine:

1. `ORDER_RECEIVED`
2. `MATERIAL_PENDING`
3. `READY_TO_CUT`
4. `CUT`
5. `AT_EMBROIDERER`
6. `EMBROIDERY_RECEIVED`
7. `ASSEMBLY`
8. `READY_FOR_DELIVERY`
9. `DELIVERED`
10. `CLOSED`

Not every order must pass through every optional state. Every transition should be recorded in history with timestamp.

### Important inventory rule

Fabric is consumed from available stock when the garment is marked `CUT`, not when the order is created or sent to the embroiderer.

## 7. Embroidery workflow

The system must support multiple embroidery providers even if only one is active initially.

### Provider fields

- Name
- Phone (optional)
- Active/inactive
- Notes

### Embroidery job fields

- Order/order item
- Provider
- Sent date
- Expected return date
- Actual return date
- Estimated cost
- Actual cost
- Status
- Notes

Typical promised turnaround is 2–3 weeks, but dates must be explicit per job.

The application must derive:

- number of garments currently with a provider;
- days remaining until expected return;
- days overdue;
- total estimated/actual embroidery cost.

## 8. Raw-material inventory

Initial material categories:

- Fabric — unit: meter
- Closure — unit: each
- Thread — unit: spool
- Packaging bag — unit: each
- Other

Black fabric, closures, thread and packaging may be stocked. Less common fabric colors may be purchased specifically for an order.

### Material fields

- Name
- Category
- Unit of measure
- Color (optional)
- Current quantity (derived from movements)
- Minimum-stock threshold (optional)
- Active/inactive

### Stock movements

Stock quantity must be derived from immutable movements rather than direct edits.

Movement types include:

- Purchase receipt
- Consumption by order/cut
- Adjustment increase
- Adjustment decrease
- Return/correction if needed

Every movement should store quantity, date, material, reason/type and optional related order/purchase.

## 9. Purchases

A purchase can add materials to stock.

Fields:

- Date
- Supplier (optional in MVP)
- Material lines
- Quantity
- Total line cost
- Derived unit cost
- Total purchase cost
- Payment method (optional)
- Notes

Historical purchase prices must be preserved. Inventory valuation should use weighted-average cost so future price increases can be handled without redesign.

Example: 100 paper bags for S/ 200 results in an incoming movement of 100 units at S/ 2/unit.

## 10. Finished-goods stock

Finished garments held for sale must be tracked explicitly.

Fields:

- Product/model
- Size
- Color
- Quantity
- Reference sale price
- Status if individual reservation is needed

A sale from stock reduces finished-goods stock and creates the same financial/payment records as a made-to-order sale.

## 11. Costs and margin

Costs must remain separated by nature:

- Direct material
- External embroidery
- Own labor
- Packaging
- Other direct costs

Where applicable, store both:

- estimated cost at order creation/planning; and
- actual cost after the operation occurs.

Order contribution margin (managerial/reference) = agreed sale price minus attributable order costs.

This is not statutory accounting profit.

## 12. Expenses

The MVP must allow general expense registration.

Suggested categories:

- Packaging
- Delivery
- Transportation
- Advertising
- Utilities/services
- Indirect materials
- Other

Fields:

- Date
- Description
- Category
- Amount
- Payment method
- Related order (optional)
- Notes

This enables separation between order margin and approximate monthly business result.

## 13. Dashboard

The first screen must prioritize urgency.

### Urgent section

- Late orders
- Deliveries in the next 7 days
- Late embroidery jobs

### Operations

- Active orders
- At embroiderer
- Ready for delivery

### Money

- Sales agreed in current month
- Cash collected in current month
- Outstanding receivables
- Estimated/actual attributable costs
- General expenses
- Approximate managerial result

### Inventory

- Low-stock alerts
- Key material quantities
- Finished garments available

## 14. Mobile-first quick actions

Home should expose prominent actions:

- New order
- Register payment
- Purchase materials
- Register expense

## 15. MVP acceptance scenario

The first end-to-end vertical is complete when the user can:

1. Create a customer.
2. Create a made-to-order dress for that customer.
3. Select size and color and agree a sale price/delivery date.
4. Register a Yape or Plin deposit.
5. Confirm/record required fabric.
6. Mark the garment as cut and automatically consume fabric stock.
7. Send the cut piece to an embroidery provider with expected date and estimated cost.
8. See it appear in the embroidery pending/late view.
9. Mark embroidery as received and record actual cost.
10. Advance through assembly and ready-for-delivery.
11. Register the remaining payment.
12. Deliver and close the order.
13. See the final order margin and updated dashboard totals.
