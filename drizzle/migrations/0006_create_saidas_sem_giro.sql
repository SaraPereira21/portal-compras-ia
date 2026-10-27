CREATE TABLE public.saidas_sem_giro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES public.materiais_sem_giro(id),
  referencia text NOT NULL,
  descricao text,
  lote text,
  quantidade numeric NOT NULL,
  solicitante text,
  os_numero text,
  observacao text,
  baixado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.saidas_sem_giro TO authenticated;
GRANT ALL ON public.saidas_sem_giro TO service_role;

ALTER TABLE public.saidas_sem_giro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores leem saidas sem giro"
  ON public.saidas_sem_giro FOR SELECT TO authenticated
  USING (public.is_any_manager(auth.uid()));

CREATE POLICY "Gestores registram saidas sem giro"
  ON public.saidas_sem_giro FOR INSERT TO authenticated
  WITH CHECK (public.is_any_manager(auth.uid()));

CREATE INDEX idx_saidas_sem_giro_ref ON public.saidas_sem_giro (referencia);
