ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS tratativa_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS tratativa_por_nome text,
  ADD COLUMN IF NOT EXISTS tratativa_at timestamptz;
