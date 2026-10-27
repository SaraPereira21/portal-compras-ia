CREATE POLICY "aprovadores_pcm_manage" ON public.aprovadores
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'pcm'))
  WITH CHECK (public.has_role(auth.uid(), 'pcm'));
