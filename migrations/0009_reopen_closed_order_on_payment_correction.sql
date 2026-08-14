CREATE OR REPLACE FUNCTION reopen_closed_order_on_payment_correction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_status text;
BEGIN
  IF OLD.amount IS NOT DISTINCT FROM NEW.amount THEN
    RETURN NEW;
  END IF;

  SELECT status, agreed_total_price
    INTO v_status, v_total
  FROM orders
  WHERE id = NEW.order_id
  FOR UPDATE;

  IF v_status <> 'CLOSED' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(amount), 0)
    INTO v_paid
  FROM payments
  WHERE order_id = NEW.order_id;

  IF v_paid < v_total THEN
    UPDATE orders
       SET status = 'DELIVERED', closed_at = NULL, updated_at = now()
     WHERE id = NEW.order_id;

    INSERT INTO order_status_history (order_id, from_status, to_status, note)
    VALUES (NEW.order_id, 'CLOSED', 'DELIVERED', 'Reabierto automáticamente por corrección de pago');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reopen_closed_order_after_payment_update ON payments;
CREATE TRIGGER reopen_closed_order_after_payment_update
AFTER UPDATE OF amount ON payments
FOR EACH ROW
EXECUTE FUNCTION reopen_closed_order_on_payment_correction();
