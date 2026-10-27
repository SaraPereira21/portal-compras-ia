CREATE TABLE public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  emails_to text[] NOT NULL DEFAULT '{}',
  emails_cc text[] NOT NULL DEFAULT '{}',
  portal boolean NOT NULL DEFAULT false,
  portal_url text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fornecedores_nome_uk ON public.fornecedores (upper(nome));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores TO authenticated;
GRANT ALL ON public.fornecedores TO service_role;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fornecedores_select_gestao" ON public.fornecedores FOR SELECT TO authenticated USING (public.is_any_manager(auth.uid()));
CREATE POLICY "fornecedores_write_gestao" ON public.fornecedores FOR ALL TO authenticated USING (public.is_any_manager(auth.uid())) WITH CHECK (public.is_any_manager(auth.uid()));

CREATE TRIGGER fornecedores_updated_at BEFORE UPDATE ON public.fornecedores FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

CREATE TABLE public.envios_pedido (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_compra_id uuid REFERENCES public.pedidos_compra(id) ON DELETE SET NULL,
  numero_pedido_compra text,
  fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome text,
  para text[] NOT NULL DEFAULT '{}',
  cc text[] NOT NULL DEFAULT '{}',
  assunto text,
  corpo text,
  anexos jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'ENVIADO',
  erro text,
  enviado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.envios_pedido TO authenticated;
GRANT ALL ON public.envios_pedido TO service_role;
ALTER TABLE public.envios_pedido ENABLE ROW LEVEL SECURITY;
CREATE POLICY "envios_select_gestao" ON public.envios_pedido FOR SELECT TO authenticated USING (public.is_any_manager(auth.uid()));
CREATE POLICY "envios_write_gestao" ON public.envios_pedido FOR ALL TO authenticated USING (public.is_any_manager(auth.uid())) WITH CHECK (public.is_any_manager(auth.uid()));

CREATE INDEX envios_pedido_pedido_idx ON public.envios_pedido (pedido_compra_id);
