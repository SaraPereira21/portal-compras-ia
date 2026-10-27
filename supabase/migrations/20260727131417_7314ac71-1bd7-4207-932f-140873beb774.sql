CREATE TABLE IF NOT EXISTS public.frota_import_tmp (cod text, modelo text, serie text);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frota_import_tmp TO authenticated;
GRANT ALL ON public.frota_import_tmp TO service_role;
ALTER TABLE public.frota_import_tmp ENABLE ROW LEVEL SECURITY;
CREATE POLICY frota_tmp_admin ON public.frota_import_tmp FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
