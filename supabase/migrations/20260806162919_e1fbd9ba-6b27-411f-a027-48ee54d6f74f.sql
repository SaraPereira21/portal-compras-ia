DROP POLICY IF EXISTS materiais_almox_read_anon ON public.materiais_almox;
REVOKE SELECT ON public.materiais_almox FROM anon;
