DROP POLICY IF EXISTS solic_insert_all ON public.solicitacoes;
CREATE POLICY solic_insert_managers ON public.solicitacoes
  FOR INSERT TO authenticated
  WITH CHECK (is_any_manager(auth.uid()));

DROP POLICY IF EXISTS notif_insert_all ON public.notificacoes;
CREATE POLICY notif_insert_managers ON public.notificacoes
  FOR INSERT TO authenticated
  WITH CHECK (is_any_manager(auth.uid()));
