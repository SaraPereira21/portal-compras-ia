ALTER TABLE public.solicitacoes ADD COLUMN IF NOT EXISTS pode_ser_paralela boolean NOT NULL DEFAULT true;
