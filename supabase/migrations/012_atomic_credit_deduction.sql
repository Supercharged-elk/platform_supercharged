-- Atomic credit deduction to prevent race condition double-spend.
-- Replaces the read-modify-write pattern in canvas-auth.ts deductCredit().
CREATE OR REPLACE FUNCTION deduct_user_credit(p_user_id UUID, p_credit_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  -- Validate allowed credit types to prevent SQL injection via format()
  IF p_credit_type NOT IN ('generate_credits', 'edit_credits', 'animate_credits') THEN
    RAISE EXCEPTION 'Invalid credit type: %', p_credit_type;
  END IF;

  EXECUTE format(
    'UPDATE credits SET %I = %I - 1 WHERE user_id = $1 AND %I > 0',
    p_credit_type, p_credit_type, p_credit_type
  ) USING p_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Atomic credit refund (for failed Replicate calls)
CREATE OR REPLACE FUNCTION refund_user_credit(p_user_id UUID, p_credit_type TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_credit_type NOT IN ('generate_credits', 'edit_credits', 'animate_credits') THEN
    RAISE EXCEPTION 'Invalid credit type: %', p_credit_type;
  END IF;

  EXECUTE format(
    'UPDATE credits SET %I = %I + 1 WHERE user_id = $1',
    p_credit_type, p_credit_type
  ) USING p_user_id;
END;
$$;
