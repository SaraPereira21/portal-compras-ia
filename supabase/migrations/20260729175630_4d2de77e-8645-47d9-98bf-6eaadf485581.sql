CREATE OR REPLACE VIEW public.solicitacoes_publicas AS
SELECT
  s.id,
  s.status,
  s.os_numero,
  s.descricao,
  s.codigo_peca,
  s.quantidade,
  s.unidade,
  s.urgencia,
  s.rc_numero,
  s.numero_pedido_compra,
  s.reserva_numero,
  s.prazo_entrega,
  s.created_at,
  s.supervisor_at,
  s.pcm_at,
  s.comprador_at,
  s.aprovador_gestao_at,
  s.data_recebimento_almox,
  s.data_entrega_mecanico,
  s.equipamento_id,
  e.prefixo_interno,
  e.codigo_armac,
  e.modelo,
  e.numero_serie,
  sol.nome AS solicitante_nome
FROM public.solicitacoes s
LEFT JOIN public.equipamentos e ON e.id = s.equipamento_id
LEFT JOIN public.solicitantes sol ON sol.id = s.solicitante_id;

ALTER VIEW public.solicitacoes_publicas SET (security_invoker = off);

GRANT SELECT ON public.solicitacoes_publicas TO anon;
GRANT SELECT ON public.solicitacoes_publicas TO authenticated;
GRANT SELECT ON public.solicitacoes_publicas TO service_role;
