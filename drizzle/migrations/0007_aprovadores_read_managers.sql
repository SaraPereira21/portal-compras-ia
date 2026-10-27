DROP POLICY IF EXISTS "aprovadores_read_auth" ON public.aprovadores;
CREATE POLICY "aprovadores_read_managers" ON public.aprovadores FOR SELECT TO authenticated USING (public.is_any_manager(auth.uid()));
