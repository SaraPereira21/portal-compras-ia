ALTER TABLE public.pedidos_compra
ALTER COLUMN numero_pedido_compra DROP NOT NULL;

ALTER TABLE public.pedidos_compra
DROP CONSTRAINT IF EXISTS pedidos_compra_numero_pedido_compra_key;

DROP INDEX IF EXISTS public.idx_pedidos_compra_numero;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_compra_numero_unico
ON public.pedidos_compra(numero_pedido_compra)
WHERE numero_pedido_compra IS NOT NULL;
