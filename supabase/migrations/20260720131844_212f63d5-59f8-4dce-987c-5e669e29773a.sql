
-- Permite ao solicitante anônimo criar RC (o fluxo do mecânico é anônimo por design).
-- Restringe o INSERT anon: só pode criar RC vinculando-se a um solicitante ATIVO.
GRANT INSERT ON public.solicitacoes TO anon;

DROP POLICY IF EXISTS solic_insert_anon ON public.solicitacoes;
CREATE POLICY solic_insert_anon
  ON public.solicitacoes
  FOR INSERT
  TO anon
  WITH CHECK (
    solicitante_id IN (SELECT id FROM public.solicitantes WHERE ativo = true)
    AND status = 'SOLICITADA'
  );

-- Solicitante anônimo também precisa corrigir uma pendência (status volta a SOLICITADA)
-- e confirmar recebimento — mas essas operações usam supabaseAdmin no server, então
-- não requerem policy UPDATE para anon.
