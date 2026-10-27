CREATE TABLE IF NOT EXISTS public.pedidos_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_pedido_compra TEXT NOT NULL UNIQUE,
  valor_total NUMERIC(12,2) NOT NULL,
  fornecedor TEXT,
  tipo_frete public.tipo_frete,
  transportadora TEXT,
  codigo_rastreio TEXT,
  link_rastreio TEXT,
  prazo_entrega DATE,
  comprador_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pedidos_compra TO anon, authenticated;
GRANT INSERT, UPDATE ON public.pedidos_compra TO authenticated;
GRANT ALL ON public.pedidos_compra TO service_role;

ALTER TABLE public.pedidos_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedidos_compra_read_all"
ON public.pedidos_compra
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "pedidos_compra_manage_auth"
ON public.pedidos_compra
FOR ALL
TO authenticated
USING (public.is_any_manager(auth.uid()))
WITH CHECK (public.is_any_manager(auth.uid()));

ALTER TABLE public.solicitacoes
ADD COLUMN IF NOT EXISTS pedido_compra_id UUID REFERENCES public.pedidos_compra(id);

CREATE INDEX IF NOT EXISTS idx_solic_pedido_compra_id ON public.solicitacoes(pedido_compra_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_numero ON public.pedidos_compra(numero_pedido_compra);

CREATE TRIGGER tg_pedidos_compra_updated
BEFORE UPDATE ON public.pedidos_compra
FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

INSERT INTO public.pedidos_compra (
  numero_pedido_compra,
  valor_total,
  fornecedor,
  tipo_frete,
  transportadora,
  codigo_rastreio,
  link_rastreio,
  prazo_entrega,
  comprador_at
)
SELECT DISTINCT ON (numero_pedido_compra)
  numero_pedido_compra,
  SUM(COALESCE(valor_total, 0)) OVER (PARTITION BY numero_pedido_compra) AS valor_total,
  fornecedor,
  tipo_frete,
  transportadora,
  codigo_rastreio,
  link_rastreio,
  prazo_entrega,
  comprador_at
FROM public.solicitacoes
WHERE numero_pedido_compra IS NOT NULL
  AND COALESCE(valor_total, 0) > 0
ORDER BY numero_pedido_compra, updated_at DESC
ON CONFLICT (numero_pedido_compra) DO UPDATE SET
  valor_total = EXCLUDED.valor_total,
  fornecedor = COALESCE(EXCLUDED.fornecedor, public.pedidos_compra.fornecedor),
  tipo_frete = COALESCE(EXCLUDED.tipo_frete, public.pedidos_compra.tipo_frete),
  transportadora = COALESCE(EXCLUDED.transportadora, public.pedidos_compra.transportadora),
  codigo_rastreio = COALESCE(EXCLUDED.codigo_rastreio, public.pedidos_compra.codigo_rastreio),
  link_rastreio = COALESCE(EXCLUDED.link_rastreio, public.pedidos_compra.link_rastreio),
  prazo_entrega = COALESCE(EXCLUDED.prazo_entrega, public.pedidos_compra.prazo_entrega),
  comprador_at = COALESCE(EXCLUDED.comprador_at, public.pedidos_compra.comprador_at);

UPDATE public.solicitacoes s
SET pedido_compra_id = p.id,
    valor_total = NULL
FROM public.pedidos_compra p
WHERE s.numero_pedido_compra = p.numero_pedido_compra
  AND s.pedido_compra_id IS NULL;
