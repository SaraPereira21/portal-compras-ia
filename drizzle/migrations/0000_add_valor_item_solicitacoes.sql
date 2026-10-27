ALTER TABLE public.solicitacoes ADD COLUMN IF NOT EXISTS valor_item numeric;
ALTER TABLE public.solicitacoes ADD COLUMN IF NOT EXISTS sap_conferido_at timestamptz;
COMMENT ON COLUMN public.solicitacoes.valor_item IS 'Valor real do item vindo do relatorio SAP (por peca, nao por pedido)';
