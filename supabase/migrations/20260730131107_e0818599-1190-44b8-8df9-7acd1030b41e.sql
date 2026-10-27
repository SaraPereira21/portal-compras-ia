CREATE OR REPLACE VIEW public.equipamentos_publicos AS
  SELECT id, prefixo_interno, codigo_armac, descricao, modelo, numero_serie
  FROM public.equipamentos
  WHERE ativo = true;

CREATE OR REPLACE VIEW public.solicitantes_publicos AS
  SELECT id, nome
  FROM public.solicitantes
  WHERE ativo = true;

CREATE OR REPLACE VIEW public.pedidos_publicos AS
  SELECT id, numero_pedido_compra, tipo_frete, transportadora, codigo_rastreio,
         link_rastreio, prazo_entrega, prazo_dias_entrega, comprador_at, created_at, updated_at
  FROM public.pedidos_compra;

CREATE OR REPLACE VIEW public.consumo_publicos AS
  SELECT id, solicitante_id, equipamento_id, os_numero, material, quantidade, unidade,
         observacao, status, reserva_numero, created_at, updated_at
  FROM public.consumo_materiais;

GRANT SELECT ON public.equipamentos_publicos TO anon, authenticated, service_role;
GRANT SELECT ON public.solicitantes_publicos TO anon, authenticated, service_role;
GRANT SELECT ON public.pedidos_publicos TO anon, authenticated, service_role;
GRANT SELECT ON public.consumo_publicos TO anon, authenticated, service_role;
