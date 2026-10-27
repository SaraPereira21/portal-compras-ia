
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('supervisor','pcm','comprador','coordenador','gerente','admin');

CREATE TYPE public.solicitacao_status AS ENUM (
  'SOLICITADA',
  'APROVADA_SUPERVISOR',
  'CANCELADA_SUPERVISOR',
  'EM_TRATAMENTO_PCM',
  'AGUARDANDO_ORCAMENTO',
  'ORCAMENTO_RECEBIDO',
  'PEDIDO_EM_APROVACAO_COORD',
  'PEDIDO_EM_APROVACAO_GERENTE',
  'PEDIDO_EM_APROVACAO_DIRETORIA',
  'PEDIDO_APROVADO_GESTAO',
  'PEDIDO_REPROVADO_GESTAO',
  'PEDIDO_COLOCADO',
  'EM_TRANSITO',
  'RECEBIDA_ALMOX',
  'FINALIZADA',
  'ENTREGUE_MECANICO'
);

CREATE TYPE public.tipo_frete AS ENUM ('LOCAL','TRANSPORTADORA');

-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT,
  telefone_whatsapp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- ============ user_roles ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_any_manager(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

-- Admin manage roles
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Trigger auto-profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ equipamentos ============
CREATE TABLE public.equipamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefixo_interno TEXT NOT NULL UNIQUE,
  codigo_armac TEXT,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.equipamentos TO anon, authenticated;
GRANT ALL ON public.equipamentos TO service_role;
ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipamentos_read_all" ON public.equipamentos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "equipamentos_admin_manage" ON public.equipamentos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ solicitantes ============
CREATE TABLE public.solicitantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.solicitantes TO anon, authenticated;
GRANT ALL ON public.solicitantes TO service_role;
ALTER TABLE public.solicitantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solicitantes_read_all" ON public.solicitantes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "solicitantes_admin_manage" ON public.solicitantes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ configuracoes ============
CREATE TABLE public.configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.configuracoes TO anon, authenticated;
GRANT ALL ON public.configuracoes TO service_role;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_read_all" ON public.configuracoes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "config_admin_manage" ON public.configuracoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.configuracoes (chave, valor) VALUES ('janela_duplicidade_dias','180') ON CONFLICT DO NOTHING;

-- ============ solicitacoes ============
CREATE TABLE public.solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- cabecalho
  equipamento_id UUID NOT NULL REFERENCES public.equipamentos(id),
  solicitante_id UUID NOT NULL REFERENCES public.solicitantes(id),
  os_numero TEXT NOT NULL,
  observacoes_gerais TEXT,
  vai_para_outro BOOLEAN NOT NULL DEFAULT false,
  equipamento_uso_id UUID REFERENCES public.equipamentos(id), -- onde a peça vai efetivamente ser usada (não muda custo)
  -- peça
  descricao TEXT NOT NULL,
  codigo_peca TEXT,
  codigo_peca_normalizado TEXT GENERATED ALWAYS AS (
    upper(regexp_replace(coalesce(codigo_peca,''), '[^A-Za-z0-9]', '', 'g'))
  ) STORED,
  quantidade NUMERIC NOT NULL DEFAULT 1,
  unidade TEXT,
  urgencia TEXT NOT NULL DEFAULT 'NORMAL', -- NORMAL | URGENTE | PARADA
  foto_peca_path TEXT,
  -- duplicidade
  justificativa_duplicidade TEXT,
  duplicidade_detectada BOOLEAN NOT NULL DEFAULT false,
  -- supervisor
  supervisor_id UUID REFERENCES auth.users(id),
  supervisor_at TIMESTAMPTZ,
  motivo_reprovacao_supervisor TEXT,
  -- pcm
  pcm_id UUID REFERENCES auth.users(id),
  pcm_at TIMESTAMPTZ,
  rc_numero TEXT,
  orcamento_path TEXT,
  observacoes_pcm TEXT,
  liberacao_diretoria BOOLEAN NOT NULL DEFAULT false,
  liberacao_diretoria_at TIMESTAMPTZ,
  -- comprador
  comprador_id UUID REFERENCES auth.users(id),
  comprador_at TIMESTAMPTZ,
  numero_pedido_compra TEXT,
  valor_total NUMERIC(12,2),
  fornecedor TEXT,
  tipo_frete public.tipo_frete,
  transportadora TEXT,
  codigo_rastreio TEXT,
  link_rastreio TEXT,
  pedido_compra_path TEXT,
  prazo_entrega DATE,
  -- coord / gerente
  aprovador_gestao_id UUID REFERENCES auth.users(id),
  aprovador_gestao_at TIMESTAMPTZ,
  motivo_reprovacao_gestao TEXT,
  -- almox / mecânico
  data_recebimento_almox TIMESTAMPTZ,
  recebido_almox_por UUID REFERENCES auth.users(id),
  data_entrega_mecanico TIMESTAMPTZ,
  observacao_recebimento TEXT,
  pedido_retirada BOOLEAN NOT NULL DEFAULT false,
  observacao_retirada TEXT,
  -- status
  status public.solicitacao_status NOT NULL DEFAULT 'SOLICITADA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.solicitacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.solicitacoes TO anon; -- solicitante sem login precisa criar/ler
GRANT ALL ON public.solicitacoes TO service_role;
ALTER TABLE public.solicitacoes ENABLE ROW LEVEL SECURITY;

-- Leitura: anon e authenticated podem ver tudo (painel público de rastreio + solicitantes buscando duplicidade)
CREATE POLICY "solic_read_all" ON public.solicitacoes FOR SELECT TO anon, authenticated USING (true);
-- Insert: anon (solicitante) e authenticated
CREATE POLICY "solic_insert_all" ON public.solicitacoes FOR INSERT TO anon, authenticated WITH CHECK (true);
-- Update: apenas gestores autenticados
CREATE POLICY "solic_update_managers" ON public.solicitacoes FOR UPDATE TO authenticated
  USING (public.is_any_manager(auth.uid())) WITH CHECK (public.is_any_manager(auth.uid()));
-- Solicitante (anon) pode confirmar recebimento físico → limitado a mudar apenas data_entrega_mecanico via server function; RLS bloqueia direct update

CREATE INDEX idx_solic_status ON public.solicitacoes(status);
CREATE INDEX idx_solic_created ON public.solicitacoes(created_at DESC);
CREATE INDEX idx_solic_codigo_norm ON public.solicitacoes(codigo_peca_normalizado);
CREATE INDEX idx_solic_descricao_trgm ON public.solicitacoes USING gin (descricao gin_trgm_ops);
CREATE INDEX idx_solic_numero_pedido ON public.solicitacoes(numero_pedido_compra);
CREATE INDEX idx_solic_os ON public.solicitacoes(os_numero);
CREATE INDEX idx_solic_equip ON public.solicitacoes(equipamento_id);
CREATE INDEX idx_solic_prazo ON public.solicitacoes(prazo_entrega);

CREATE OR REPLACE FUNCTION public.tg_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER tg_solic_updated BEFORE UPDATE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- ============ notificacoes ============
CREATE TABLE public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_role public.app_role, -- notificação por papel
  destinatario_user_id UUID REFERENCES auth.users(id),
  destinatario_solicitante_id UUID REFERENCES public.solicitantes(id), -- para mecânicos
  solicitacao_id UUID REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notificacoes TO anon, authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_read_all" ON public.notificacoes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "notif_insert_all" ON public.notificacoes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "notif_update_all" ON public.notificacoes FOR UPDATE TO anon, authenticated USING (true);

CREATE INDEX idx_notif_solic ON public.notificacoes(solicitacao_id);
CREATE INDEX idx_notif_role ON public.notificacoes(destinatario_role) WHERE lida = false;
CREATE INDEX idx_notif_solicitante ON public.notificacoes(destinatario_solicitante_id) WHERE lida = false;
