
-- configuracoes: só admin lê
DROP POLICY IF EXISTS config_read_auth ON public.configuracoes;
CREATE POLICY config_read_admin ON public.configuracoes
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- pedidos_compra: leitura autenticada só para papéis operacionais
DROP POLICY IF EXISTS pedidos_compra_read_auth ON public.pedidos_compra;
CREATE POLICY pedidos_compra_read_managers ON public.pedidos_compra
  FOR SELECT TO authenticated
  USING (is_any_manager(auth.uid()));

-- solicitacoes: leitura autenticada só para papéis operacionais
DROP POLICY IF EXISTS solic_read_auth ON public.solicitacoes;
CREATE POLICY solic_read_managers ON public.solicitacoes
  FOR SELECT TO authenticated
  USING (is_any_manager(auth.uid()));

-- storage: anexos só para papéis operacionais (leitura/alteração)
DROP POLICY IF EXISTS anexos_read ON storage.objects;
DROP POLICY IF EXISTS anexos_update ON storage.objects;
DROP POLICY IF EXISTS anexos_insert ON storage.objects;

CREATE POLICY anexos_read_managers ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'solicitacao-anexos' AND is_any_manager(auth.uid()));

CREATE POLICY anexos_insert_managers ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'solicitacao-anexos' AND is_any_manager(auth.uid()));

CREATE POLICY anexos_update_managers ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'solicitacao-anexos' AND is_any_manager(auth.uid()))
  WITH CHECK (bucket_id = 'solicitacao-anexos' AND is_any_manager(auth.uid()));

CREATE POLICY anexos_delete_managers ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'solicitacao-anexos' AND is_any_manager(auth.uid()));
