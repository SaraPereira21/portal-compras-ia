DELETE FROM public.envios_pedido WHERE id = 'f50b1002-9651-4f86-b229-9cdfd48f7cf5';

UPDATE public.solicitacoes s
SET status = 'PEDIDO_COLOCADO', updated_at = now()
WHERE s.status = 'PEDIDO_APROVADO_GESTAO'
  AND s.pedido_compra_id IN (
    SELECT e.pedido_compra_id FROM public.envios_pedido e
    WHERE e.pedido_compra_id IS NOT NULL
  );
