DROP POLICY IF EXISTS consumo_read_public ON public.consumo_materiais;
REVOKE SELECT ON public.consumo_materiais FROM anon;

DROP POLICY IF EXISTS anexos_insert_anon ON storage.objects;
CREATE POLICY anexos_insert_anon ON storage.objects
FOR INSERT TO anon
WITH CHECK (
  bucket_id = 'solicitacao-anexos'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.solicitantes s
    WHERE s.ativo = true
      AND s.id = ((storage.foldername(name))[1])::uuid
  )
);
