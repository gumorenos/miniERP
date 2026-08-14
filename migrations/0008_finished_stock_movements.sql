CREATE TABLE finished_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  product_id uuid NOT NULL REFERENCES products(id),
  size text NOT NULL,
  color text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  quantity_signed integer NOT NULL,
  unit_cost numeric(12,2),
  notes text
);

CREATE INDEX finished_stock_business_product_idx
  ON finished_stock_movements (business_id, product_id, size, color);
