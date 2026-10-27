ALTER TYPE public.solicitacao_status ADD VALUE IF NOT EXISTS 'PENDENCIA_SOLICITANTE';
ALTER TABLE public.solicitacoes ADD COLUMN IF NOT EXISTS pcm_motivo_pendencia text;
