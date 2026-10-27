UPDATE public.equipamentos e
SET modelo = NULLIF(t.modelo,''), numero_serie = NULLIF(t.serie,'')
FROM public.frota_import_tmp t
WHERE e.codigo_armac = t.cod;

UPDATE public.equipamentos e
SET modelo = NULLIF(t.modelo,''), numero_serie = NULLIF(t.serie,'')
FROM public.frota_import_tmp t
WHERE e.prefixo_interno = t.cod AND e.modelo IS NULL;

INSERT INTO public.equipamentos (prefixo_interno, codigo_armac, descricao, modelo, numero_serie, ativo)
SELECT t.cod, t.cod, NULLIF(t.modelo,''), NULLIF(t.modelo,''), NULLIF(t.serie,''), true
FROM public.frota_import_tmp t
WHERE NOT EXISTS (SELECT 1 FROM public.equipamentos e WHERE e.codigo_armac = t.cod OR e.prefixo_interno = t.cod);

DROP TABLE public.frota_import_tmp;
