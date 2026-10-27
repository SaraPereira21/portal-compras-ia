-- Permitir leitura pública de solicitantes/equipamentos ativos para a área do Solicitante (fluxo anônimo)
GRANT SELECT ON public.solicitantes TO anon;
GRANT SELECT ON public.equipamentos TO anon;

CREATE POLICY "solicitantes_public_read_ativos"
  ON public.solicitantes FOR SELECT
  TO anon
  USING (ativo = true);

CREATE POLICY "equipamentos_public_read_ativos"
  ON public.equipamentos FOR SELECT
  TO anon
  USING (ativo = true);
