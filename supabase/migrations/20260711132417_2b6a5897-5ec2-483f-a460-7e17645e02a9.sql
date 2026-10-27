
CREATE POLICY "anexos_read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'solicitacao-anexos');
CREATE POLICY "anexos_insert" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'solicitacao-anexos');
CREATE POLICY "anexos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'solicitacao-anexos');
