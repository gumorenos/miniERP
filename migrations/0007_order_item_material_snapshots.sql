ALTER TABLE order_items
  ADD COLUMN closure_material_id uuid REFERENCES materials(id),
  ADD COLUMN planned_closure_qty numeric(12,3),
  ADD COLUMN packaging_material_id uuid REFERENCES materials(id),
  ADD COLUMN planned_packaging_qty numeric(12,3);

CREATE UNIQUE INDEX one_closure_consumption_per_item
  ON stock_movements(order_item_id)
  WHERE type = 'ORDER_CLOSURE_CONSUMPTION' AND order_item_id IS NOT NULL;

CREATE UNIQUE INDEX one_packaging_consumption_per_item
  ON stock_movements(order_item_id)
  WHERE type = 'ORDER_PACKAGING_CONSUMPTION' AND order_item_id IS NOT NULL;
