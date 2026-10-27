CREATE TABLE public.aprovadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bu text NOT NULL,
  coordenador text NOT NULL,
  gerente text NOT NULL,
  diretor text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coordenador)
);

GRANT SELECT ON public.aprovadores TO authenticated;
GRANT SELECT ON public.aprovadores TO anon;
GRANT ALL ON public.aprovadores TO service_role;

ALTER TABLE public.aprovadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY aprovadores_read_auth ON public.aprovadores FOR SELECT TO authenticated USING (true);
CREATE POLICY aprovadores_read_anon ON public.aprovadores FOR SELECT TO anon USING (ativo = true);
CREATE POLICY aprovadores_admin_manage ON public.aprovadores FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER aprovadores_updated_at BEFORE UPDATE ON public.aprovadores
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

INSERT INTO public.aprovadores (bu, coordenador, gerente, diretor) VALUES
  ('BU SPOT', 'JOYCE ALMEIDA', 'BRUNO CROCCI', 'VICTOR MARINHO'),
  ('BU GERDAU', 'DAYVSON LUIZ ALVEZ BEZERRA', 'BRUNO CROCCI', 'VICTOR MARINHO'),
  ('BU PECÉM', 'NYVANDRO ALMEIDA', 'BRUNO CROCCI', 'VICTOR MARINHO'),
  ('BU SÃO LUIS', 'ROBSON ANTONIO', 'BRUNO CROCCI', 'VICTOR MARINHO'),
  ('BU MATRIZ', 'JORGE SANTIAGO', 'JUAN DOURADO', 'VICTOR MARINHO');

ALTER TABLE public.pedidos_compra
  ADD COLUMN IF NOT EXISTS bu text,
  ADD COLUMN IF NOT EXISTS coordenador text,
  ADD COLUMN IF NOT EXISTS gerente text,
  ADD COLUMN IF NOT EXISTS diretor text;
