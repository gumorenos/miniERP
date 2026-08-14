CREATE TABLE IF NOT EXISTS deleted_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  snapshot jsonb,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS deleted_records_business_entity_idx
  ON deleted_records (business_id, entity_type, entity_id);
