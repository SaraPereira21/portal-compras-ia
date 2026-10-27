DROP POLICY IF EXISTS aprovadores_read_anon ON public.aprovadores;
REVOKE SELECT ON public.aprovadores FROM anon;
