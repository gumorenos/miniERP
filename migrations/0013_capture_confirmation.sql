ALTER TABLE capture_drafts
  ADD COLUMN IF NOT EXISTS confirmed_order_id uuid REFERENCES orders(id);

CREATE INDEX IF NOT EXISTS capture_drafts_confirmed_order_idx
  ON capture_drafts (confirmed_order_id)
  WHERE confirmed_order_id IS NOT NULL;
