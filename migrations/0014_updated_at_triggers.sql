CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'businesses',
    'users',
    'customers',
    'materials',
    'products',
    'orders',
    'suppliers',
    'embroidery_providers',
    'capture_drafts'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at_trigger ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp()',
      table_name
    );
  END LOOP;
END;
$$;
