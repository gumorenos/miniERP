ALTER TABLE capture_drafts
  ADD COLUMN IF NOT EXISTS conversation_key text;

CREATE INDEX IF NOT EXISTS capture_drafts_conversation_idx
  ON capture_drafts (business_id, channel, conversation_key, status, updated_at DESC)
  WHERE conversation_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS capture_draft_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  draft_id uuid NOT NULL REFERENCES capture_drafts(id) ON DELETE CASCADE,
  channel text NOT NULL,
  conversation_key text,
  source_message_id text NOT NULL,
  raw_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS capture_draft_messages_source_idx
  ON capture_draft_messages (business_id, channel, source_message_id);

CREATE INDEX IF NOT EXISTS capture_draft_messages_draft_idx
  ON capture_draft_messages (draft_id, created_at);

INSERT INTO capture_draft_messages (business_id, draft_id, channel, source_message_id, raw_text, created_at)
SELECT business_id, id, channel, source_message_id, raw_text, created_at
FROM capture_drafts
WHERE source_message_id IS NOT NULL
ON CONFLICT (business_id, channel, source_message_id) DO NOTHING;
