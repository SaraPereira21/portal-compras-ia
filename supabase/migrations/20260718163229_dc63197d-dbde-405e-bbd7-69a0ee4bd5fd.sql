
GRANT SELECT ON public.solicitacoes TO anon;
GRANT SELECT ON public.pedidos_compra TO anon;
CREATE POLICY "solic_read_public" ON public.solicitacoes FOR SELECT TO anon USING (true);
CREATE POLICY "pedidos_read_public" ON public.pedidos_compra FOR SELECT TO anon USING (true);
