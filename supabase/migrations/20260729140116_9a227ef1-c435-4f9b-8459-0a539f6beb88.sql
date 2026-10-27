DROP POLICY IF EXISTS solic_read_public ON public.solicitacoes;
DROP POLICY IF EXISTS pedidos_read_public ON public.pedidos_compra;
REVOKE SELECT ON public.solicitacoes FROM anon;
REVOKE SELECT ON public.pedidos_compra FROM anon;
