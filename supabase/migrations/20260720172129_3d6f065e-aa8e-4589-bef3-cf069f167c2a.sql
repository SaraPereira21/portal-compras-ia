CREATE POLICY "anexos_insert_anon" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'solicitacao-anexos');
