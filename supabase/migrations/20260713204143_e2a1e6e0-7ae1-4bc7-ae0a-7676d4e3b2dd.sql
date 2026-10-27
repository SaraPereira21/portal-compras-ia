
-- 1) Endurece is_any_manager (whitelist explícito)
CREATE OR REPLACE FUNCTION public.is_any_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('supervisor','pcm','comprador','coordenador','gerente','admin')
  );
$$;

-- 2) profiles: cada um vê o seu; admin vê tudo
DROP POLICY IF EXISTS profiles_select_all_auth ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 3) user_roles: cada um vê os seus; admin vê tudo
DROP POLICY IF EXISTS user_roles_select_auth ON public.user_roles;
CREATE POLICY user_roles_select_self_or_admin ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 4) Solicitações: leitura só autenticado
DROP POLICY IF EXISTS solic_read_all ON public.solicitacoes;
CREATE POLICY solic_read_auth ON public.solicitacoes
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- 5) Pedidos de compra: leitura só autenticado
DROP POLICY IF EXISTS pedidos_compra_read_all ON public.pedidos_compra;
CREATE POLICY pedidos_compra_read_auth ON public.pedidos_compra
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- 6) Notificações: leitura só do destinatário (ou admin); update só do destinatário (ou admin)
DROP POLICY IF EXISTS notif_read_all ON public.notificacoes;
CREATE POLICY notif_read_own ON public.notificacoes
  FOR SELECT TO authenticated
  USING (
    destinatario_user_id = auth.uid()
    OR (destinatario_role IS NOT NULL AND public.has_role(auth.uid(), destinatario_role::public.app_role))
    OR public.has_role(auth.uid(),'admin')
  );

DROP POLICY IF EXISTS notif_update_all ON public.notificacoes;
CREATE POLICY notif_update_own ON public.notificacoes
  FOR UPDATE TO authenticated
  USING (
    destinatario_user_id = auth.uid()
    OR (destinatario_role IS NOT NULL AND public.has_role(auth.uid(), destinatario_role::public.app_role))
    OR public.has_role(auth.uid(),'admin')
  )
  WITH CHECK (auth.uid() IS NOT NULL);

-- 7) Configurações / equipamentos / solicitantes: leitura só autenticado
DROP POLICY IF EXISTS config_read_all ON public.configuracoes;
CREATE POLICY config_read_auth ON public.configuracoes
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS equipamentos_read_all ON public.equipamentos;
CREATE POLICY equipamentos_read_auth ON public.equipamentos
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS solicitantes_read_all ON public.solicitantes;
CREATE POLICY solicitantes_read_auth ON public.solicitantes
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- 8) Storage: restringe bucket privado a autenticados
DROP POLICY IF EXISTS anexos_read ON storage.objects;
CREATE POLICY anexos_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'solicitacao-anexos');

DROP POLICY IF EXISTS anexos_insert ON storage.objects;
CREATE POLICY anexos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'solicitacao-anexos');

-- update já é authenticated only, mas garantimos
DROP POLICY IF EXISTS anexos_update ON storage.objects;
CREATE POLICY anexos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'solicitacao-anexos')
  WITH CHECK (bucket_id = 'solicitacao-anexos');
