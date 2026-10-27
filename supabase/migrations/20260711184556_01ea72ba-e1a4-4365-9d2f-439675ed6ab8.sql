CREATE OR REPLACE FUNCTION public.limpar_valor_individual_solicitacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.valor_total := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_limpar_valor_individual_solicitacao ON public.solicitacoes;
CREATE TRIGGER tg_limpar_valor_individual_solicitacao
BEFORE INSERT OR UPDATE OF valor_total ON public.solicitacoes
FOR EACH ROW
EXECUTE FUNCTION public.limpar_valor_individual_solicitacao();
