CREATE TABLE public.consumo_materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_id uuid NOT NULL REFERENCES public.solicitantes(id),
  equipamento_id uuid REFERENCES public.equipamentos(id),
  os_numero text,
  material text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1,
  unidade text NOT NULL DEFAULT 'UN',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.consumo_materiais TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consumo_materiais TO authenticated;
GRANT ALL ON public.consumo_materiais TO service_role;

ALTER TABLE public.consumo_materiais ENABLE ROW LEVEL SECURITY;

CREATE POLICY consumo_read_public ON public.consumo_materiais FOR SELECT TO anon USING (true);
CREATE POLICY consumo_insert_anon ON public.consumo_materiais FOR INSERT TO anon
  WITH CHECK (solicitante_id IN (SELECT s.id FROM public.solicitantes s WHERE s.ativo = true));
CREATE POLICY consumo_read_managers ON public.consumo_materiais FOR SELECT TO authenticated USING (is_any_manager(auth.uid()));
CREATE POLICY consumo_write_managers ON public.consumo_materiais FOR ALL TO authenticated
  USING (is_any_manager(auth.uid())) WITH CHECK (is_any_manager(auth.uid()));

CREATE TRIGGER consumo_materiais_updated_at BEFORE UPDATE ON public.consumo_materiais
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

CREATE INDEX idx_consumo_materiais_solicitante ON public.consumo_materiais(solicitante_id, created_at DESC);
