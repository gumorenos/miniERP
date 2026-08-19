alter table capture_drafts
  add column if not exists confirmed_entity_type text,
  add column if not exists confirmed_entity_id uuid;
