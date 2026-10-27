CREATE TABLE public.materiais_sem_giro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referencia text NOT NULL UNIQUE,
  descricao text,
  qtd numeric NOT NULL DEFAULT 0,
  lote text,
  tipo_produto text,
  valor_unit numeric,
  desenho text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiais_sem_giro TO authenticated;
GRANT SELECT ON public.materiais_sem_giro TO anon;
GRANT ALL ON public.materiais_sem_giro TO service_role;

ALTER TABLE public.materiais_sem_giro ENABLE ROW LEVEL SECURITY;

CREATE POLICY materiais_sem_giro_read_all ON public.materiais_sem_giro
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY materiais_sem_giro_manage ON public.materiais_sem_giro
  FOR ALL TO authenticated
  USING (public.is_any_manager(auth.uid()))
  WITH CHECK (public.is_any_manager(auth.uid()));

CREATE INDEX idx_materiais_sem_giro_ref_trgm ON public.materiais_sem_giro USING gin (referencia gin_trgm_ops);
CREATE INDEX idx_materiais_sem_giro_desc_trgm ON public.materiais_sem_giro USING gin (descricao gin_trgm_ops);

CREATE TRIGGER materiais_sem_giro_updated_at BEFORE UPDATE ON public.materiais_sem_giro
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
