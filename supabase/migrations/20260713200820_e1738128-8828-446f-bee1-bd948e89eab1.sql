
-- 1) Restringir políticas permissivas a authenticated
DROP POLICY IF EXISTS solic_insert_all ON public.solicitacoes;
CREATE POLICY solic_insert_all ON public.solicitacoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS notif_insert_all ON public.notificacoes;
CREATE POLICY notif_insert_all ON public.notificacoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS notif_update_all ON public.notificacoes;
CREATE POLICY notif_update_all ON public.notificacoes
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 2) Fixar search_path da função de trigger
CREATE OR REPLACE FUNCTION public.tg_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
