CREATE TABLE IF NOT EXISTS capture_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  channel text NOT NULL,
  source_message_id text,
  raw_text text NOT NULL,
  intent text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  payload_json text NOT NULL,
  missing_fields_json text NOT NULL DEFAULT '[]',
  ambiguous_fields_json text NOT NULL DEFAULT '[]',
  parser_version text NOT NULL,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS capture_drafts_business_status_idx
  ON capture_drafts (business_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS capture_drafts_source_idx
  ON capture_drafts (business_id, channel, source_message_id)
  WHERE source_message_id IS NOT NULL;
