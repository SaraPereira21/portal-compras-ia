CREATE TABLE public.materiais_almox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_sap text NOT NULL,
  descricao text,
  locacao text,
  qtd numeric NOT NULL DEFAULT 0,
  desenho_engeman text,
  referencia_fabrica text,
  descricao_antiga text,
  novo_cod text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX materiais_almox_codigo_sap_key ON public.materiais_almox (codigo_sap);
CREATE INDEX materiais_almox_desc_trgm ON public.materiais_almox USING gin (descricao gin_trgm_ops);
CREATE INDEX materiais_almox_ref_idx ON public.materiais_almox (referencia_fabrica);

GRANT SELECT ON public.materiais_almox TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiais_almox TO authenticated;
GRANT ALL ON public.materiais_almox TO service_role;

ALTER TABLE public.materiais_almox ENABLE ROW LEVEL SECURITY;

CREATE POLICY materiais_almox_read_anon ON public.materiais_almox FOR SELECT TO anon USING (true);
CREATE POLICY materiais_almox_read_auth ON public.materiais_almox FOR SELECT TO authenticated USING (true);
CREATE POLICY materiais_almox_admin_manage ON public.materiais_almox FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER materiais_almox_updated_at BEFORE UPDATE ON public.materiais_almox
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
