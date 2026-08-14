CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  name text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id);

CREATE INDEX IF NOT EXISTS suppliers_business_name_idx
  ON suppliers (business_id, name);

CREATE INDEX IF NOT EXISTS purchases_supplier_idx
  ON purchases (business_id, supplier_id);
