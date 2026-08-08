CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  name text NOT NULL,
  phone text,
  instagram_handle text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  name text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL,
  color text,
  minimum_stock numeric(12, 3),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  name text NOT NULL,
  type text NOT NULL,
  base_sale_price numeric(12, 2) NOT NULL,
  default_fabric_material_id uuid REFERENCES materials(id),
  default_fabric_qty_meters numeric(12, 3),
  default_closure_material_id uuid REFERENCES materials(id),
  default_closure_qty numeric(12, 3),
  default_embroidery_cost numeric(12, 2),
  default_own_labor_cost numeric(12, 2),
  default_packaging_material_id uuid REFERENCES materials(id),
  default_packaging_qty numeric(12, 3),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_size_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size text NOT NULL,
  price_adjustment numeric(12, 2) NOT NULL DEFAULT 0,
  fixed_price numeric(12, 2),
  UNIQUE(product_id, size)
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  order_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  order_date date NOT NULL,
  promised_delivery_date date,
  fulfillment_type text NOT NULL,
  status text NOT NULL,
  agreed_total_price numeric(12, 2) NOT NULL,
  notes text,
  delivered_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, order_number)
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  size text NOT NULL,
  color text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  agreed_unit_price numeric(12, 2) NOT NULL,
  fabric_material_id uuid REFERENCES materials(id),
  planned_fabric_qty numeric(12, 3),
  actual_fabric_qty numeric(12, 3),
  estimated_material_cost numeric(12, 2),
  actual_material_cost numeric(12, 2),
  estimated_own_labor_cost numeric(12, 2),
  actual_own_labor_cost numeric(12, 2),
  estimated_packaging_cost numeric(12, 2),
  actual_packaging_cost numeric(12, 2),
  other_estimated_direct_cost numeric(12, 2),
  other_actual_direct_cost numeric(12, 2)
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  purchase_date date NOT NULL,
  supplier_name text,
  total_amount numeric(12, 2) NOT NULL,
  payment_method text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id),
  quantity numeric(12, 3) NOT NULL,
  total_cost numeric(12, 2) NOT NULL,
  unit_cost numeric(12, 4) NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  material_id uuid NOT NULL REFERENCES materials(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  quantity_signed numeric(12, 3) NOT NULL,
  unit_cost numeric(12, 4),
  purchase_line_id uuid REFERENCES purchase_lines(id),
  order_item_id uuid REFERENCES order_items(id),
  notes text
);

CREATE UNIQUE INDEX IF NOT EXISTS one_cut_consumption_per_item
  ON stock_movements(order_item_id)
  WHERE type = 'ORDER_CONSUMPTION' AND order_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  paid_at timestamptz NOT NULL DEFAULT now(),
  amount numeric(12, 2) NOT NULL,
  method text NOT NULL,
  notes text
);

CREATE TABLE IF NOT EXISTS embroidery_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  name text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS embroidery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES embroidery_providers(id),
  status text NOT NULL,
  sent_at timestamptz,
  expected_return_date date,
  received_at timestamptz,
  estimated_cost numeric(12, 2),
  actual_cost numeric(12, 2),
  notes text
);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  expense_date date NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  payment_method text,
  order_id uuid REFERENCES orders(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

