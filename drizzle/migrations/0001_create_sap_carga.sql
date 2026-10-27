CREATE TABLE public.sap_carga (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  ref_id uuid,
  numero_pedido text,
  valor numeric,
  fornecedor text,
  status text,
  coordenador text,
  gerente text,
  diretor text,
  data_pedido date,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sap_carga TO authenticated;
GRANT ALL ON public.sap_carga TO service_role;

ALTER TABLE public.sap_carga ENABLE ROW LEVEL SECURITY;

CREATE POLICY sap_carga_manage_gestao ON public.sap_carga
  FOR ALL TO authenticated
  USING (public.is_any_manager(auth.uid()))
  WITH CHECK (public.is_any_manager(auth.uid()));
