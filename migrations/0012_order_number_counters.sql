CREATE TABLE IF NOT EXISTS order_number_counters (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

INSERT INTO order_number_counters (business_id, last_number)
SELECT
  b.id,
  COALESCE(MAX(NULLIF(regexp_replace(o.order_number, '[^0-9]', '', 'g'), '')::integer), 0)
FROM businesses b
LEFT JOIN orders o ON o.business_id = b.id
GROUP BY b.id
ON CONFLICT (business_id) DO NOTHING;
