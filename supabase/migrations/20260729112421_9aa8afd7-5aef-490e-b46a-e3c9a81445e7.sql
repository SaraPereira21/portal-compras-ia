ALTER TABLE public.consumo_materiais
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'SOLICITADO',
  ADD COLUMN IF NOT EXISTS reserva_numero text,
  ADD COLUMN IF NOT EXISTS tratado_por uuid,
  ADD COLUMN IF NOT EXISTS tratado_at timestamp with time zone;

GRANT SELECT, INSERT, UPDATE ON public.consumo_materiais TO authenticated;
GRANT ALL ON public.consumo_materiais TO service_role;

DROP POLICY IF EXISTS consumo_update_managers ON public.consumo_materiais;
CREATE POLICY consumo_update_managers ON public.consumo_materiais
  FOR UPDATE TO authenticated
  USING (is_any_manager(auth.uid()))
  WITH CHECK (is_any_manager(auth.uid()));
