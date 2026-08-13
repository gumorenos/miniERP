ALTER TABLE products
  ADD COLUMN IF NOT EXISTS lead_time_days integer NOT NULL DEFAULT 25;
