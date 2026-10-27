import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useMemo, useDeferredValue } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listSolicitacoes, atualizarSolicitacao, atualizarPedidoCompra, alimentarPedidoCompra, salvarDadosPedido, atualizarSolicitacoesEmLote } from "@/lib/solicitacoes.functions";
import { aprovadorAtual } from "@/lib/aprovadores";
import { isRcSemPedido } from "@/lib/fases";
import { useAprovadores, acharAprovador, EditarAprovadoresBotao } from "@/components/GerenciarAprovadores";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConsumoAlmoxTab from "@/components/ConsumoAlmoxTab";
import ImportarEstoqueAlmox from "@/components/ImportarEstoqueAlmox";
import NovaRequisicaoPcm from "@/components/NovaRequisicaoPcm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Download, ExternalLink, LogOut, AlertTriangle, Paperclip, Pencil, Trash2 } from "lucide-react";
import DesvioBadge from "@/components/DesvioBadge";
import MiniEstoqueBadge from "@/components/MiniEstoqueBadge";
import { EnviarPedidoFornecedorButton, AdminFornecedores, HistoricoEnviosPedidos, MarcarComoEnviadoButton } from "@/components/EnvioPedidoFornecedor";
import SugestaoComprasTab from "@/components/SugestaoComprasTab";
import ServicosTerceirosTab from "@/components/ServicosTerceirosTab";
import ImportarSapTab from "@/components/ImportarSapTab";
import BuscaMaterialAlmox from "@/components/BuscaMaterialAlmox";
import PainelGestorTab from "@/components/PainelGestorTab";
import SelecionarEquipamento, { type EquipamentoSelecionado } from "@/components/SelecionarEquipamento";





function FotoPeca({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let alive = true;
    let localBlobUrl: string | null = null;

    async function carregarAnexo() {
      setErro(false);
      setUrl(null);
      setBlobUrl(null);

      const { data, error } = await supabase.storage.from("solicitacao-anexos").createSignedUrl(path, 3600);
      if (!alive) return;
      if (error || !data?.signedUrl) {
        setErro(true);
        return;
      }

      setUrl(data.signedUrl);

      try {
        const response = await fetch(data.signedUrl);
        if (!response.ok) throw new Error("Falha ao carregar anexo");
        const blob = await response.blob();
        localBlobUrl = URL.createObjectURL(blob);
        if (alive) setBlobUrl(localBlobUrl);
      } catch {
        if (alive) setErro(true);
      }
    }

    carregarAnexo();

    return () => {
      alive = false;
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
    };
  }, [path]);

  if (erro) {
    return (
      <a
        href={url ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-2 rounded border p-2 text-xs text-destructive hover:bg-accent"
      >
        <Paperclip className="h-3 w-3" /> Tentar abrir anexo
      </a>
    );
  }

  if (!url) return <span className="text-xs text-muted-foreground">carregando anexo…</span>;

  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const nomeArquivo = path.split("/").pop() ?? `anexo.${ext || "arquivo"}`;
  const isImg = ["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext);
  const isPdf = ext === "pdf";
  const abrirUrl = blobUrl ?? url;

  return (
    <div className="inline-flex items-center gap-2 rounded border p-1">
      {isImg
        ? <img src={url} alt="Anexo da peça" className="h-16 w-16 rounded object-cover" />
        : <span className="flex h-16 w-16 items-center justify-center rounded bg-muted text-xs font-semibold uppercase">{ext || "arq"}</span>}

      <div className="flex flex-col gap-1">
        <a
          href={abrirUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> {isPdf ? "Abrir PDF" : "Abrir anexo"}
        </a>
        <a
          href={abrirUrl}
          download={nomeArquivo}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          <Download className="h-3 w-3" /> Baixar
        </a>
        {!blobUrl && <span className="text-[10px] text-muted-foreground">preparando visualização…</span>}
      </div>
    </div>
  );

}

/** Anexo sob demanda: só baixa o arquivo quando o usuário clica (evita travar listas grandes). */
function FotoPecaLazy({ path }: { path: string }) {
  const [aberto, setAberto] = useState(false);
  if (aberto) return <FotoPeca path={path} />;
  return (
    <button
      type="button"
      onClick={() => setAberto(true)}
      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-primary hover:bg-accent"
    >
      <Paperclip className="h-3 w-3" /> Ver anexo
    </button>
  );
}

import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];
type Solic = Awaited<ReturnType<typeof listSolicitacoes>>[number];
type PedidoCompra = Database["public"]["Tables"]["pedidos_compra"]["Row"];
type PrazoModo = "IMEDIATA" | "3" | "7" | "15" | "30" | "CUSTOM";

const PRAZO_OPCOES: Array<{ value: PrazoModo; label: string }> = [
  { value: "IMEDIATA", label: "Entrega imediata" },
  { value: "3", label: "3 dias" },
  { value: "7", label: "7 dias" },
  { value: "15", label: "15 dias" },
  { value: "30", label: "30 dias" },
  { value: "CUSTOM", label: "Data específica" },
];

const FRETE_OPCOES: Array<{ value: "LOCAL" | "TRANSPORTADORA"; label: string }> = [
  { value: "LOCAL", label: "Local / retirada" },
  { value: "TRANSPORTADORA", label: "Transportadora" },
];

function pedidoDe(s: Solic): PedidoCompra | null {
  return (s as Solic & { pedido?: PedidoCompra | null }).pedido ?? null;
}

// Ferramentaria: compras indiretas (uso da oficina) ou solicitadas por TELES
function isFerramentaria(s: Solic): boolean {
  const eq = (s as { equipamento?: { prefixo_interno?: string | null } }).equipamento;
  const prefixo = (eq?.prefixo_interno ?? "").toUpperCase();
  const solicitante = ((s as { solicitante?: { nome?: string | null } }).solicitante?.nome ?? "").toUpperCase();
  return prefixo.startsWith("INDIRETO") || solicitante.includes("TELES");
}

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({ meta: [
    { title: "Painel PCM — Portal de Compras" },
    { name: "description", content: "Tratativas e acompanhamento das solicitações, RCs e pedidos da oficina." },
    { property: "og:title", content: "Painel PCM — Portal de Compras" },
    { property: "og:description", content: "Acompanhe e atualize as solicitações, máquinas, OSs e pedidos da manutenção." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: PainelPage,
});

function PainelPage() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [nome, setNome] = useState("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const [{ data: r }, { data: p }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        supabase.from("profiles").select("nome, must_change_password").eq("id", u.user.id).maybeSingle(),
      ]);
      if (p?.must_change_password) {
        navigate({ to: "/trocar-senha" });
        return;
      }
      setRoles((r ?? []).map((x) => x.role));
      setNome(p?.nome ?? u.user.email ?? "");
    })();
  }, []);

  const listSolic = useServerFn(listSolicitacoes);
  const { data: todas = [], refetch } = useQuery({
    queryKey: ["solicitacoes", "todas"],
    queryFn: () => listSolic({ data: { limit: 5000 } }),
    refetchInterval: 15000,
  });

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const sairEIrParaHome = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem("solicitante_id");
    } catch { /* noop */ }
    window.location.href = "/";
  };


  if (roles === null) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>;
  }

  if (roles.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8">
        <Card>
          <CardHeader>
            <CardTitle>Aguardando liberação</CardTitle>
            <CardDescription>
              Sua conta ainda não tem perfil atribuído. Peça a um Admin para atribuir seu papel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={logout} className="w-full"><LogOut className="mr-2 h-4 w-4" /> Sair</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determina aba padrão pela primeira role
  const isSupervisor = roles.includes("supervisor");
  const isPcm = roles.includes("pcm");
  const isComprador = roles.includes("comprador");
  const isCoord = roles.includes("coordenador");
  const isGerente = roles.includes("gerente");
  const isAdmin = roles.includes("admin");

  // Aba Ferramentaria temporariamente oculta a pedido do usuário.
  // Para reativar: mude FERRAMENTARIA_VISIVEL para true.
  const FERRAMENTARIA_VISIVEL = false;
  // Comprador e Aprovadores não usam o portal por ora — o PCM faz tudo.
  // Para reativar, mude estas chaves para true.
  const COMPRADOR_VISIVEL = false;
  const APROVACOES_VISIVEL = false;
  const itensFerramentaria = todas.filter(isFerramentaria);
  const itensPcm = FERRAMENTARIA_VISIVEL ? todas.filter((s) => !isFerramentaria(s)) : todas;

  const tabs: Array<{ key: string; label: string; enabled: boolean; render: () => React.ReactNode }> = [
    { key: "supervisor", label: "Supervisor", enabled: isSupervisor || isAdmin, render: () => <SupervisorTab items={todas} onChange={refetch} /> },
    { key: "gestor", label: "📊 Painel Gestor", enabled: isPcm || isCoord || isGerente || isAdmin, render: () => <PainelGestorTab items={todas} /> },
    { key: "pcm", label: "PCM", enabled: isPcm || isAdmin, render: () => <PcmTab items={itensPcm} onChange={refetch} /> },
    { key: "ferramentaria", label: "🔧 Ferramentaria", enabled: FERRAMENTARIA_VISIVEL && (isPcm || isAdmin), render: () => <PcmTab items={itensFerramentaria} onChange={refetch} escopo="FERRAMENTARIA" /> },

    { key: "consumo", label: "🧰 Consumo/Almox", enabled: isPcm || isAdmin, render: () => <ConsumoAlmoxTab /> },
    { key: "estoque-sap", label: "📥 Estoque SAP", enabled: isPcm || isAdmin, render: () => <ImportarEstoqueAlmox /> },

    
    { key: "admin", label: "Admin", enabled: isAdmin, render: () => <AdminTab /> },
  ].filter((t) => t.enabled);

  return (
    <div className="min-h-screen bg-muted">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={sairEIrParaHome}
              title="Sair e voltar para a home"
              className="shrink-0 rounded-md transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <span className="font-bold text-xl">Portal de Compras</span>
            </button>


            <div className="min-w-0 border-l pl-3">
              <Link to="/" className="text-[11px] text-muted-foreground hover:text-foreground">Portal de Compras</Link>
              <p className="truncate text-sm font-semibold">{nome}</p>
              <p className="truncate text-[11px] text-muted-foreground">{roles.join(" · ")}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={logout}><LogOut className="mr-2 h-4 w-4" /> Sair</Button>
        </div>
      </header>


      <main className="mx-auto w-full px-4 py-6">
        <Tabs defaultValue={tabs[0].key}>
          <TabsList className="flex flex-wrap">
            {tabs.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
          </TabsList>
          {tabs.map((t) => <TabsContent key={t.key} value={t.key} className="mt-4">{t.render()}</TabsContent>)}
        </Tabs>
      </main>
    </div>
  );
}

// ---------- Compartilhado ----------
function ParalelaBadge({ s, canEdit, onToggle }: { s: Solic; canEdit?: boolean; onToggle?: (v: boolean) => void }) {
  const pode = (s as { pode_ser_paralela?: boolean }).pode_ser_paralela ?? true;
  const el = pode
    ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Paralela: SIM</Badge>
    : <Badge className="bg-rose-600 hover:bg-rose-600 animate-pulse">⚠ SÓ ORIGINAL</Badge>;
  if (!canEdit) return el;
  return (
    <button type="button" onClick={() => onToggle?.(!pode)} title="Clique para alternar (Supervisor)" className="inline-flex">
      {el}
    </button>
  );
}

function SolicCard({ s, actions, canEditParalela, onToggleParalela }: { s: Solic; actions?: React.ReactNode; canEditParalela?: boolean; onToggleParalela?: (v: boolean) => void }) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const prazoDate = s.prazo_entrega ? new Date(s.prazo_entrega) : null;
  const jaChegou = ["RECEBIDA_ALMOX", "ENTREGUE_MECANICO", "FINALIZADA"].includes(s.status);
  const isAtrasada = prazoDate && prazoDate < hoje && !jaChegou;
  const chegaHoje = prazoDate && prazoDate.getTime() === hoje.getTime() && !jaChegou;
  return (
    <Card className={isAtrasada ? "border-red-500" : chegaHoje ? "border-amber-500" : ""}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{s.descricao}</CardTitle>
            <DesvioBadge solicitacao={s} />
            <CardDescription className="text-xs">
              OS {s.os_numero} · Qtd {s.quantidade} {s.unidade} · {s.urgencia}
              {s.codigo_peca ? ` · cod. ${s.codigo_peca}` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <ParalelaBadge s={s} canEdit={canEditParalela} onToggle={onToggleParalela} />
            {isAtrasada && <Badge variant="destructive" className="animate-pulse">🚨 VERIFICAR SE CHEGOU!</Badge>}
            {chegaHoje && <Badge className="animate-pulse bg-amber-500 text-white hover:bg-amber-500">📦 ENTREGA HOJE</Badge>}
            <Badge variant="outline">{s.status}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>Solicitante: <b className="text-foreground">{(s as { solicitante?: { nome?: string } }).solicitante?.nome ?? "—"}</b></span>
          <span>Equip: <b className="text-foreground">{(s as { equipamento?: { prefixo_interno?: string } }).equipamento?.prefixo_interno ?? "—"}</b></span>
          {s.duplicidade_detectada && <span className="text-orange-700"><AlertTriangle className="mr-1 inline h-3 w-3" />DUPLICIDADE</span>}
          {s.fornecedor && <span>Forn: {s.fornecedor}</span>}
          {s.numero_pedido_compra && <span>PC #{s.numero_pedido_compra}</span>}
          {s.prazo_entrega && <span>Prazo: {new Date(s.prazo_entrega).toLocaleDateString("pt-BR")}</span>}
        </div>
        {s.justificativa_duplicidade && (
          <p className="mt-2 rounded bg-orange-50 p-2 text-orange-900">Just. dup.: {s.justificativa_duplicidade}</p>
        )}
        {s.foto_peca_path && (
          <div className="mt-2"><FotoPeca path={s.foto_peca_path} /></div>
        )}
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </CardContent>
    </Card>
  );
}

function useUpdate() {
  const qc = useQueryClient();
  const atualizar = useServerFn(atualizarSolicitacao);
  return useMutation({
    mutationFn: (v: { id: string; patch: Record<string, unknown>; msg?: string }) =>
      atualizar({ data: { id: v.id, patch: v.patch } }).then(() => v),
    onSuccess: (v) => { toast.success(v.msg ?? "Atualizado"); qc.invalidateQueries({ queryKey: ["solicitacoes"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
}


// ---------- Utilitário: agrupar por OS + Equipamento ----------
type Bloco = { key: string; os: string; equipNome: string; solicitante: string; itens: Solic[] };
function agrupar(items: Solic[]): Bloco[] {
  const map = new Map<string, Bloco>();
  for (const s of items) {
    const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null } }).equipamento;
    const sol = (s as { solicitante?: { nome?: string } }).solicitante?.nome ?? "—";
    const key = `${s.os_numero}::${s.equipamento_id}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        os: s.os_numero,
        equipNome: `${eq?.prefixo_interno ?? "?"}${eq?.codigo_armac ? " · cod. " + eq.codigo_armac : ""}`,
        solicitante: sol,
        itens: [],
      });
    }
    map.get(key)!.itens.push(s);
  }
  return Array.from(map.values());
}

const STATUS_LABEL: Record<string, string> = {
  SOLICITADA: "AGUARDANDO SUPERVISOR",
  APROVADA_SUPERVISOR: "FILA DO PCM",
  EM_TRATAMENTO_PCM: "RC CRIADA",
  PENDENCIA_SOLICITANTE: "DEVOLVIDA AO SOLICITANTE",
  PEDIDO_EM_APROVACAO_COORD: "PEDIDO EM APROVAÇÃO — COORDENADOR",
  PEDIDO_EM_APROVACAO_GERENTE: "PEDIDO EM APROVAÇÃO — GERENTE",
  PEDIDO_EM_APROVACAO_DIRETORIA: "PEDIDO EM APROVAÇÃO — DIRETORIA",
  PEDIDO_APROVADO_GESTAO: "PEDIDO APROVADO — ENVIAR",
  PEDIDO_REPROVADO_GESTAO: "PEDIDO REJEITADO",
  PEDIDO_COLOCADO: "ENVIADO AO FORNECEDOR",
  RECEBIDA_ALMOX: "RECEBIDA NO ALMOXARIFADO",
  ENTREGUE_MECANICO: "ENTREGUE AO SOLICITANTE",
  FINALIZADA: "FINALIZADA",
  REPROVADA: "REPROVADA PELO SUPERVISOR",
  CANCELADA_SUPERVISOR: "CANCELADA PELO SUPERVISOR",
  CANCELADA: "CANCELADA",
};
// Status antigos que não são mais oferecidos, mas ainda existem em registros históricos
const STATUS_LEGADO: Record<string, string> = { EM_TRANSITO: "ENVIADO AO FORNECEDOR" };
const statusLabel = (s: string) => STATUS_LABEL[s] ?? STATUS_LEGADO[s] ?? s;


// Chaves virtuais de filtro:
// RC_GERADA        = RC criada e ainda SEM nº de pedido de compra
// LIB_COMPRADOR    = aprovado pela gestão e JÁ COM nº de pedido (pronto p/ envio)
// Reserva no estoque local (RES) conta como atendida — nunca é "RC sem pedido"
const temPedido = (s: { numero_pedido_compra?: string | null; reserva_numero?: string | null }) => !!(s.numero_pedido_compra ?? "").trim() || !!(s.reserva_numero ?? "").trim();
const casaStatusChave = (s: { status: string; numero_pedido_compra?: string | null; reserva_numero?: string | null }, chave: string) => {
  if (chave === "RC_GERADA") return !temPedido(s) && (s.status === "EM_TRATAMENTO_PCM" || s.status === "PEDIDO_APROVADO_GESTAO");
  if (chave === "LIB_COMPRADOR") return s.status === "PEDIDO_APROVADO_GESTAO" && temPedido(s);
  return s.status === chave;
};
// Rótulo real: aprovado pela gestão mas sem nº de pedido ainda é RC CRIADA
const statusLabelDe = (s: { status: string; numero_pedido_compra?: string | null }) =>
  s.status === "PEDIDO_APROVADO_GESTAO" && !temPedido(s) ? "RC CRIADA" : statusLabel(s.status);

// ---------- Fases do acompanhamento do PCM ----------
type Fase = "RC_SEM_PEDIDO" | "EM_APROVACAO" | "APROVADOS" | "ENVIADOS";
const FASE_LABEL: Record<Fase, string> = {
  RC_SEM_PEDIDO: "🧾 RC sem pedido",
  EM_APROVACAO: "🕒 Em aprovação",
  APROVADOS: "✅ Aprovados (envio solicitado)",
  ENVIADOS: "🚚 Enviados",
};
function faseDe(s: Solic): Fase | null {
  // Regra única (compartilhada com o Painel do Gestor)
  if (isRcSemPedido(s)) return "RC_SEM_PEDIDO";
  if (s.status.startsWith("PEDIDO_EM_APROVACAO")) return "EM_APROVACAO";
  if (s.status === "PEDIDO_APROVADO_GESTAO" && temPedido(s)) return "APROVADOS";
  if (s.status === "PEDIDO_COLOCADO" || s.status === "EM_TRANSITO") return "ENVIADOS";
  return null;
}
function dataFaseDe(s: Solic, f: Fase): string | null {
  if (f === "RC_SEM_PEDIDO") return s.pcm_at ?? s.created_at ?? null;
  if (f === "ENVIADOS") return s.comprador_at ?? s.aprovador_gestao_at ?? null;
  // Em aprovação: conta a partir da solicitação de aprovação (quando o pedido foi alimentado), nunca da criação da RC
  if (f === "EM_APROVACAO") return s.aprovador_gestao_at ?? null;
  return s.aprovador_gestao_at ?? s.pcm_at ?? s.created_at ?? null;

}
const diasDesde = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;
const fmtData = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
// Pedido rejeitado pela gestão que voltou para o PCM refazer (mantém o nº do pedido)
const precisaRefazer = (s: Solic) =>
  s.status === "EM_TRATAMENTO_PCM" && temPedido(s) && !!(s.motivo_reprovacao_gestao ?? "").trim();
const nivelAprovacaoLabel = (status: string) =>
  status === "PEDIDO_EM_APROVACAO_COORD" ? "Coordenador"
    : status === "PEDIDO_EM_APROVACAO_GERENTE" ? "Gerente"
      : status === "PEDIDO_EM_APROVACAO_DIRETORIA" ? "Diretoria" : "—";
const nomeAprovadorAtual = (s: Solic) => {
  const ped = (s as { pedido?: { coordenador?: string | null; gerente?: string | null; diretor?: string | null } }).pedido;
  if (s.status === "PEDIDO_EM_APROVACAO_COORD") return ped?.coordenador ?? null;
  if (s.status === "PEDIDO_EM_APROVACAO_GERENTE") return ped?.gerente ?? null;
  if (s.status === "PEDIDO_EM_APROVACAO_DIRETORIA") return ped?.diretor ?? null;
  return null;
};


function ItemLinha({ s, actions, canEditParalela, onToggleParalela }: { s: Solic; actions?: React.ReactNode; canEditParalela?: boolean; onToggleParalela?: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 rounded border bg-card p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium break-words">{s.descricao}</div>
          <ParalelaBadge s={s} canEdit={canEditParalela} onToggle={onToggleParalela} />
          <DesvioBadge solicitacao={s} />
          <MiniEstoqueBadge codigo={s.codigo_peca} compacto />
        </div>
        <div className="text-xs text-muted-foreground">
          Qtd {s.quantidade} {s.unidade} · {s.urgencia}
          {s.codigo_peca ? ` · cód. ${s.codigo_peca}` : ""}
          {s.duplicidade_detectada ? " · ⚠ DUPLICIDADE" : ""}
        </div>
        {s.justificativa_duplicidade && (
          <div className="mt-1 rounded bg-orange-50 p-1.5 text-xs text-orange-900">Just. dup.: {s.justificativa_duplicidade}</div>
        )}
        {s.foto_peca_path && (
          <div className="mt-2"><FotoPeca path={s.foto_peca_path} /></div>
        )}
      </div>
      {actions && <div className="flex w-full min-w-0 flex-col items-stretch gap-1 lg:w-[320px] lg:shrink-0">{actions}</div>}

    </div>
  );
}


// ---------- Supervisor ----------
function SupervisorTab({ items }: { items: Solic[]; onChange: () => void }) {
  const upd = useUpdate();
  const [reprovar, setReprovar] = useState<{ ids: string[]; label: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [verHist, setVerHist] = useState(false);
  const [busca, setBusca] = useState("");
  const buscaDef = useDeferredValue(busca);
  const casa = (s: Solic) => {
    const f = buscaDef.trim().toLowerCase();
    if (!f) return true;
    const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null; descricao?: string | null } }).equipamento;
    const sol = (s as { solicitante?: { nome?: string } }).solicitante?.nome ?? "";
    return [s.os_numero, s.descricao, s.codigo_peca ?? "", eq?.prefixo_interno ?? "", eq?.codigo_armac ?? "", eq?.descricao ?? "", sol, s.motivo_reprovacao_supervisor ?? ""]
      .join(" ").toLowerCase().includes(f);
  };
  const pendentes = items.filter((s) => s.status === "SOLICITADA" && casa(s));
  const reprovadas = items
    .filter((s) => (s.status === "REPROVADA" || s.status === "CANCELADA_SUPERVISOR" || s.status === "CANCELADA") && casa(s))
    .sort((a, b) => new Date(b.supervisor_at ?? b.created_at).getTime() - new Date(a.supervisor_at ?? a.created_at).getTime());
  const blocos = agrupar(pendentes);


  const aprovar = async (ids: string[]) => {
    await Promise.all(ids.map((id) => upd.mutateAsync({ id, patch: { status: "APROVADA_SUPERVISOR", supervisor_at: new Date().toISOString() }, msg: "" })));
    toast.success(`${ids.length} peça(s) aprovada(s)`);
  };

  const reativar = async (s: Solic) => {
    await upd.mutateAsync({
      id: s.id,
      patch: { status: "SOLICITADA", motivo_reprovacao_supervisor: null, supervisor_at: null },
      msg: "Peça reativada — voltou para sua fila de aprovação",
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">🔎 Buscar por máquina, peça, código, OS ou motivo</Label>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="EX: TE 016, MANGUEIRA, 580051325"
          className="uppercase"
        />
        {busca.trim() && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {pendentes.length} pendente(s) · {reprovadas.length} rejeitada(s) encontradas
          </p>
        )}
      </div>
      <h3 className="text-sm font-semibold">Aguardando sua aprovação — {blocos.length} OS ({pendentes.length} peças)</h3>
      {blocos.length === 0 && <p className="text-sm text-muted-foreground">Nada pendente. 👌</p>}

      {blocos.map((b) => (
        <Card key={b.key}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">🔧 {b.equipNome}</CardTitle>
            <CardDescription>OS <b>{b.os}</b> · Solicitante {b.solicitante} · {b.itens.length} peça(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {b.itens.map((s) => (
              <ItemLinha key={s.id} s={s}
                canEditParalela
                onToggleParalela={(v) => upd.mutate({ id: s.id, patch: { pode_ser_paralela: v }, msg: v ? "Peça liberada para paralela" : "Peça marcada como SÓ ORIGINAL" })}
                actions={
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => aprovar([s.id])}>✓ Aprovar</Button>
                  <Button size="sm" variant="destructive" onClick={() => setReprovar({ ids: [s.id], label: s.descricao })}>✕ Reprovar</Button>
                </>
              } />

            ))}
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="destructive" onClick={() => setReprovar({ ids: b.itens.map((i) => i.id), label: `todas as peças da OS ${b.os}` })}>Reprovar todas</Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => aprovar(b.itens.map((i) => i.id))}>Aprovar todas</Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Histórico de peças reprovadas — para reaproveitamento posterior */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">📚 Histórico de peças reprovadas ({reprovadas.length})</CardTitle>
              <CardDescription>Guardadas para consulta. Reative se decidirem comprar depois.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setVerHist((v) => !v)}>{verHist ? "Ocultar" : "Mostrar"}</Button>
          </div>
        </CardHeader>
        {(verHist || !!buscaDef.trim()) && (
          <CardContent className="space-y-2">
            {reprovadas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma peça reprovada até agora.</p>}
            {reprovadas.map((s) => {
              const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null } }).equipamento;
              const sol = (s as { solicitante?: { nome?: string } }).solicitante?.nome ?? "—";
              return (
                <div key={s.id} className="rounded border bg-muted/40 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><div className="text-sm font-medium">{s.descricao}</div><DesvioBadge solicitacao={s} /></div>
                      <div className="text-xs text-muted-foreground">
                        OS {s.os_numero} · Qtd {s.quantidade} {s.unidade}
                        {s.codigo_peca ? ` · cód. ${s.codigo_peca}` : ""}
                        {" · "}Máq. <b>{eq?.prefixo_interno ?? "?"}</b>{eq?.codigo_armac ? ` · cod. ${eq.codigo_armac}` : ""}
                        {" · "}Solicitante: {sol}
                      </div>
                      {s.motivo_reprovacao_supervisor && (
                        <div className="mt-1 rounded bg-rose-50 p-1.5 text-xs text-rose-800">
                          <b>Motivo:</b> {s.motivo_reprovacao_supervisor}
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Reprovada em: {s.supervisor_at ? new Date(s.supervisor_at).toLocaleString("pt-BR") : "—"}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => reativar(s)}>♻ Reativar</Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>

      <Dialog open={!!reprovar} onOpenChange={(v) => !v && setReprovar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar {reprovar?.label}</DialogTitle>
            <DialogDescription className="sr-only">Informe o motivo da reprovação da peça.</DialogDescription>
          </DialogHeader>
          <Label>Motivo</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReprovar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={async () => {
              if (!reprovar || !motivo.trim()) return toast.error("Informe o motivo");
              await Promise.all(reprovar.ids.map((id) => upd.mutateAsync({ id, patch: { status: "REPROVADA", motivo_reprovacao_supervisor: motivo, supervisor_at: new Date().toISOString() }, msg: "" })));
              toast.success(`${reprovar.ids.length} peça(s) reprovada(s) — ficaram no histórico para reaproveitamento`);
              setReprovar(null); setMotivo("");
            }}>Confirmar reprovação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// Máscara de moeda (R$) — digita-se em centavos: 1700000 -> 17.000,00
function formatarBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function mascaraBRL(texto: string): string {
  const digitos = texto.replace(/\D/g, "").slice(0, 12);
  if (!digitos) return "";
  return formatarBRL(Number(digitos));
}
function valorBRLParaNumero(texto: string): number | null {
  const digitos = texto.replace(/\D/g, "");
  return digitos ? Number(digitos) / 100 : null;
}

// ---------- PCM ----------
// Valor: prioriza o pedido de compra; cai para o valor da própria solicitação (histórico importado)
function valorDe(s: Solic): number | null {
  const p = (s as { pedido?: { valor_total?: number | string | null } }).pedido?.valor_total;
  const v = p ?? (s as { valor_total?: number | string | null }).valor_total;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Data da RC: usa a data da tratativa do PCM; no histórico importado usa a data do registro
function dataRcDe(s: Solic): string | null {
  const raw = s.pcm_at ?? (s.rc_numero || s.numero_pedido_compra ? s.created_at : null);
  if (!raw) return null;
  return new Date(raw).toLocaleDateString("pt-BR");
}

const fmtDataBr = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "");
const diasEntre = (a?: string | null, b?: string | null) => {
  if (!a || !b) return "";
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  return Number.isFinite(d) ? Math.max(0, Math.round(d)).toString() : "";
};

const normMaq = (v?: string | null) => (v ?? "").toUpperCase().replace(/[\s\-_.]/g, "").trim();

function exportarPdfPcm(rows: Solic[], filtros: string) {
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
  const grupos = new Map<string, Solic[]>();
  for (const s of rows) {
    const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null } }).equipamento;
    const maq = [eq?.prefixo_interno, eq?.codigo_armac].filter(Boolean).join(" · ") || "SEM MÁQUINA";
    grupos.set(maq, [...(grupos.get(maq) ?? []), s]);
  }
  const blocos = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([maq, lista]) => {
    const pecas = lista.reduce((a, s) => a + (Number(s.quantidade) || 0), 0);
    const linhas = lista.map((s) => `<tr>
      <td>${esc(s.os_numero)}</td><td>${esc(s.rc_numero)}</td><td>${esc(s.numero_pedido_compra)}</td>
      <td>${esc(s.codigo_peca)}</td><td>${esc(s.descricao)}${s.observacoes_gerais ? `<div style="color:#b45309;font-weight:bold">OBS: ${esc(s.observacoes_gerais)}</div>` : ""}</td><td style="text-align:center">${esc(s.quantidade)}</td>
      <td>${esc(s.numero_pedido_compra ? (() => { const v = valorDe(s); return v == null ? "" : "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }); })() : "")}</td><td>${esc(s.fornecedor)}</td><td>${fmtDataBr(s.created_at)}</td><td>${fmtDataBr(s.prazo_entrega)}</td>
      <td>${esc(statusLabel(s.status))}</td></tr>`).join("");
    return `<h2>${esc(maq)} <span>${lista.length} item(ns) · ${pecas} peça(s)</span></h2>
      <table><thead><tr><th>OS</th><th>RC</th><th>Pedido</th><th>Código</th><th>Descrição</th><th>Qtd</th><th>Valor do pedido</th><th>Fornecedor</th><th>Solicitada</th><th>Prazo</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table>`;
  }).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório por máquina</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;margin:20px;color:#1f2430}
      h1{font-size:18px;margin:0 0 4px} p.sub{margin:0 0 14px;font-size:11px;color:#5a6270}
      h2{font-size:13px;margin:16px 0 4px;padding:6px 8px;background:#21918c;color:#fff;border-radius:4px}
      h2 span{font-weight:normal;font-size:11px;margin-left:8px}
      table{width:100%;border-collapse:collapse;font-size:9.5px;page-break-inside:auto}
      th{background:#eef1f4;text-align:left;padding:4px;border-bottom:1px solid #cfd5dc}
      td{border-bottom:1px solid #e6e9ee;padding:3px 4px} tr{page-break-inside:avoid}
      @page{size:A4 landscape;margin:10mm}
    </style></head><body>
    <h1>Acompanhamento PCM — relatório por máquina</h1>
    <p class="sub">Gerado em ${new Date().toLocaleString("pt-BR")} · ${esc(filtros)} · ${grupos.size} máquina(s) · ${rows.length} item(ns)</p>
    ${blocos || "<p>Nenhum item.</p>"}
    <script>window.onload=()=>{window.print()}<\/script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function exportarCsvPcm(rows: Solic[]) {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "Máquina", "Modelo", "Nº série", "OS", "Solicitante", "Urgência",
    "RC", "Material", "Código", "Quantidade", "PED", "Valor do pedido", "Fornecedor",
    "Transportadora", "Rastreio", "Status",
    "Data da solicitação", "Data aprovação supervisor", "Data da RC (PCM)",
    "Data envio p/ aprovação", "Data aprovação gestão", "Data do pedido / envio",
    "Prazo de entrega previsto", "Data recebimento almox", "Data entrega ao mecânico",
    "Dias solicitação→RC", "Dias RC→aprovação", "Dias aprovação→pedido",
    "Dias pedido→chegada", "Dias chegada→entrega", "Dias totais",
    "Motivo de reprovação",
  ];
  const linhas = rows.map((s) => {
    const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null; descricao?: string | null; modelo?: string | null; numero_serie?: string | null } }).equipamento;
    const maq = [eq?.prefixo_interno, eq?.codigo_armac].filter(Boolean).join(" · ") || (eq?.descricao ?? "—");
    const valor = valorDe(s);
    const ped = (s as { pedido?: { fornecedor?: string | null; transportadora?: string | null; codigo_rastreio?: string | null } | null }).pedido;
    const motivo = s.motivo_reprovacao_gestao ?? s.motivo_reprovacao_supervisor ?? "";
    return [
      maq, eq?.modelo ?? "", eq?.numero_serie ?? "", s.os_numero,
      (s as { solicitante?: { nome?: string } }).solicitante?.nome ?? "", s.urgencia ?? "",
      s.rc_numero ?? "", s.descricao, s.codigo_peca ?? "", s.quantidade,
      s.numero_pedido_compra ?? "", valor === null ? "" : valor.toFixed(2).replace(".", ","),
      s.fornecedor ?? ped?.fornecedor ?? "", s.transportadora ?? ped?.transportadora ?? "",
      s.codigo_rastreio ?? ped?.codigo_rastreio ?? "", statusLabel(s.status),
      fmtDataBr(s.created_at), fmtDataBr(s.supervisor_at), fmtDataBr(s.pcm_at),
      fmtDataBr(s.aprovador_gestao_at), fmtDataBr(s.aprovador_gestao_at), fmtDataBr(s.comprador_at),
      fmtDataBr(s.prazo_entrega), fmtDataBr(s.data_recebimento_almox), fmtDataBr(s.data_entrega_mecanico),
      diasEntre(s.created_at, s.pcm_at), diasEntre(s.pcm_at, s.aprovador_gestao_at),
      diasEntre(s.aprovador_gestao_at, s.comprador_at), diasEntre(s.comprador_at, s.data_recebimento_almox),
      diasEntre(s.data_recebimento_almox, s.data_entrega_mecanico),
      diasEntre(s.created_at, s.data_entrega_mecanico),
      motivo,
    ];
  });



  const csv = "\uFEFF" + [header, ...linhas].map((r) => r.map(escape).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pcm-solicitacoes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function exportarCotacao(rows: Solic[]) {
  if (!rows.length) return;
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  type Eq = { prefixo_interno?: string; codigo_armac?: string | null; modelo?: string | null; numero_serie?: string | null; descricao?: string | null };
  const eq = (rows[0] as { equipamento?: Eq }).equipamento;
  const maq = [eq?.prefixo_interno, eq?.codigo_armac].filter(Boolean).join(" · ") || (eq?.descricao ?? "—");
  const os = rows[0].os_numero;
  const rc = rows.find((r) => r.rc_numero)?.rc_numero ?? "";
  const linhas: (string | number)[][] = [
    ["SOLICITAÇÃO DE COTAÇÃO"],
    ["Máquina", maq],
    ["Modelo", eq?.modelo ?? "—"],
    ["Nº de série", eq?.numero_serie ?? "—"],
    ["OS", os],
    ["RC", rc],
    [],
    ["Item", "Código da peça", "Descrição", "Qtd", "Unid.", "Observação"],
    ...rows.map((s, i) => [i + 1, s.codigo_peca ?? "", s.descricao, s.quantidade, s.unidade ?? "UN", s.observacoes_gerais ?? ""]),
  ];
  const csv = "\uFEFF" + linhas.map((r) => r.map(escape).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cotacao-${maq.replace(/[^\w-]+/g, "_")}-OS${os}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function PcmTab({ items, onChange, escopo = "PCM" }: { items: Solic[]; onChange: () => void; escopo?: "PCM" | "FERRAMENTARIA" }) {
  const ehFerramentaria = escopo === "FERRAMENTARIA";
  const upd = useUpdate();
  // Quem está tratando (trava informativa para não haver dois PCMs na mesma OS)
  const [me, setMe] = useState<{ id: string; nome: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return;
      const { data: p } = await supabase.from("profiles").select("nome").eq("id", u.id).maybeSingle();
      if (vivo) setMe({ id: u.id, nome: (p?.nome ?? u.email ?? "PCM").toUpperCase() });
    })();
    return () => { vivo = false; };
  }, []);
  const definirTratativa = async (itens: Solic[], liberar: boolean) => {
    if (!me) return toast.error("Usuário não identificado");
    const patch = liberar
      ? { tratativa_por: null, tratativa_por_nome: null, tratativa_at: null }
      : { tratativa_por: me.id, tratativa_por_nome: me.nome, tratativa_at: new Date().toISOString() };
    for (const s of itens) await upd.mutateAsync({ id: s.id, patch, msg: "" });
    toast.success(liberar ? "Tratativa liberada" : "Você assumiu esta tratativa");
  };
  const emAcao = items.filter((s) => s.status === "APROVADA_SUPERVISOR");
  const blocos = agrupar(emAcao);
  const [pendModal, setPendModal] = useState<Solic | null>(null);
  const [motivoPend, setMotivoPend] = useState("");
  const [rcs, setRcs] = useState<Record<string, string>>({});
  const [selRc, setSelRc] = useState<Record<string, boolean>>({});
  const [rcItem, setRcItem] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<Solic | null>(null);
  const [cancelModal, setCancelModal] = useState<{ itens: Solic[]; titulo: string } | null>(null);
  const [motivoCancel, setMotivoCancel] = useState("");
  // Correção da peça pedida pelo mecânico (código/descrição/quantidade)
  const [editPeca, setEditPeca] = useState<Solic | null>(null);
  const [pecaForm, setPecaForm] = useState({ codigo_peca: "", descricao: "", quantidade: 1, unidade: "UN" });
  const [pecaEquip, setPecaEquip] = useState<{ id: string; nome: string } | null>(null);
  const [buscaEqPeca, setBuscaEqPeca] = useState("");
  const termoEqPeca = buscaEqPeca.trim();
  const { data: eqsPeca = [], isFetching: buscandoEqPeca } = useQuery({
    queryKey: ["equip-busca-peca", termoEqPeca],
    enabled: termoEqPeca.length >= 2,
    queryFn: async () => {
      const like = `%${termoEqPeca.replace(/[%,()]/g, " ")}%`;
      const { data } = await supabase
        .from("equipamentos")
        .select("id, prefixo_interno, codigo_armac, descricao")
        .eq("ativo", true)
        .or(`prefixo_interno.ilike.${like},codigo_armac.ilike.${like},descricao.ilike.${like}`)
        .order("prefixo_interno")
        .limit(20);
      return data ?? [];
    },
  });
  const abrirEditPeca = (s: Solic) => {
    setEditPeca(s);
    setPecaEquip(null);
    setBuscaEqPeca("");
    setPecaForm({
      codigo_peca: s.codigo_peca ?? "",
      descricao: s.descricao ?? "",
      quantidade: Number(s.quantidade ?? 1),
      unidade: s.unidade ?? "UN",
    });
  };
  const salvarEditPeca = async () => {
    if (!editPeca) return;
    if (!pecaForm.descricao.trim()) return toast.error("Informe a descrição da peça");
    const cod = pecaForm.codigo_peca.trim().toUpperCase();
    await upd.mutateAsync({
      id: editPeca.id,
      patch: {
        codigo_peca: cod || null,
        descricao: pecaForm.descricao.trim().toUpperCase(),
        quantidade: Number(pecaForm.quantidade) || 1,
        unidade: (pecaForm.unidade || "UN").trim().toUpperCase(),
        ...(pecaEquip ? { equipamento_id: pecaEquip.id } : {}),
      },
      msg: pecaEquip ? `Peça corrigida — máquina trocada para ${pecaEquip.nome}` : "Peça corrigida",
    });
    setEditPeca(null);
  };

  const [editRc, setEditRc] = useState<Solic | null>(null);
  const [editForm, setEditForm] = useState({ os_numero: "", rc_numero: "", numero_pedido_compra: "", valor_total: "", fornecedor: "", prazo_entrega: "", codigo_peca: "", descricao: "", quantidade: 1, unidade: "UN", observacoes_gerais: "", status: "", coordenador: "" });
  // Seleção múltipla no Acompanhamento (atualização em lote)
  const [selAcomp, setSelAcomp] = useState<string[]>([]);
  const [loteForm, setLoteForm] = useState({ os_numero: "", rc_numero: "", numero_pedido_compra: "", valor_total: "", fornecedor: "", prazo_entrega: "", status: "", coordenador: "" });
  const [loteEquip, setLoteEquip] = useState<EquipamentoSelecionado | null>(null);
  const atualizarPed = useServerFn(atualizarPedidoCompra);
  const salvarPedido = useServerFn(salvarDadosPedido);
  const salvarLote = useServerFn(atualizarSolicitacoesEmLote);
  const qcLote = useQueryClient();
  const { lista: aprovadores } = useAprovadores();
  const abrirEdicao = (s: Solic) => {
    const ped = (s as { pedido?: { numero_pedido_compra?: string | null; coordenador?: string | null; valor_total?: number | string | null; fornecedor?: string | null; prazo_entrega?: string | null } }).pedido;
    const pedNum = ped?.numero_pedido_compra ?? s.numero_pedido_compra ?? "";
    const valorAtual = valorDe(s);
    setEditForm({
      os_numero: s.os_numero ?? "",
      rc_numero: s.rc_numero ?? "",
      numero_pedido_compra: pedNum,
      valor_total: valorAtual != null ? formatarBRL(Math.round(valorAtual * 100)) : "",
      fornecedor: ped?.fornecedor ?? s.fornecedor ?? "",
      prazo_entrega: ped?.prazo_entrega ?? s.prazo_entrega ?? "",
      codigo_peca: s.codigo_peca ?? "",
      descricao: s.descricao ?? "",
      quantidade: s.quantidade ?? 1,
      unidade: s.unidade ?? "UN",
      observacoes_gerais: s.observacoes_gerais ?? "",
      status: s.status ?? "",
      coordenador: ped?.coordenador ?? "",
    });
    setPecaEquip(null);
    setBuscaEqPeca("");
    setEditRc(s);
  };
  const salvarEdicao = async () => {
    if (!editRc) return;
    if (!editForm.os_numero.trim() || !editForm.descricao.trim()) {
      toast.error("OS e descrição são obrigatórias");
      return;
    }
    const qtd = Number(editForm.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      toast.error("Quantidade inválida");
      return;
    }
    const pedNum = editForm.numero_pedido_compra.trim() ? editForm.numero_pedido_compra.trim().toUpperCase() : null;
    const valorNum = valorBRLParaNumero(editForm.valor_total);
    const fornec = editForm.fornecedor.trim() ? editForm.fornecedor.trim().toUpperCase() : null;
    const prazo = editForm.prazo_entrega.trim() || null;
    await upd.mutateAsync({
      id: editRc.id,
      patch: {
        os_numero: editForm.os_numero.trim().toUpperCase(),
        rc_numero: editForm.rc_numero.trim() ? editForm.rc_numero.trim().toUpperCase() : null,
        numero_pedido_compra: pedNum,
        codigo_peca: editForm.codigo_peca.trim() ? editForm.codigo_peca.trim().toUpperCase() : null,
        descricao: editForm.descricao.trim().toUpperCase(),
        quantidade: Math.floor(qtd),
        unidade: (editForm.unidade.trim().toUpperCase() || "UN").slice(0, 12),
        observacoes_gerais: editForm.observacoes_gerais.trim() ? editForm.observacoes_gerais.trim().toUpperCase() : null,
        ...(valorNum != null ? { valor_total: valorNum } : {}),
        fornecedor: fornec,
        prazo_entrega: prazo,
        ...(editForm.status && editForm.status !== editRc.status ? { status: editForm.status as Solic["status"] } : {}),
        // A contagem de "em aprovação" começa quando o pedido é alimentado/enviado à aprovação
        ...(editForm.status && editForm.status !== editRc.status && editForm.status.startsWith("PEDIDO_EM_APROVACAO")
          ? { aprovador_gestao_at: new Date().toISOString() }
          : {}),
        ...(pecaEquip ? { equipamento_id: pecaEquip.id } : {}),
      } as Partial<Solic>,
      msg: pecaEquip ? `RC atualizada — máquina trocada para ${pecaEquip.nome}` : "RC atualizada",
    });
    const apr = acharAprovador(aprovadores, editForm.coordenador);
    if (editRc.pedido_compra_id || pedNum || valorNum != null || fornec || prazo || apr) {
      try {
        await salvarPedido({ data: {
          ids: [editRc.id],
          numero_pedido_compra: pedNum,
          patch: {
            ...(valorNum != null ? { valor_total: valorNum } : {}),
            ...(fornec ? { fornecedor: fornec } : {}),
            ...(prazo ? { prazo_entrega: prazo } : {}),
            ...(apr ? { bu: apr.bu ?? null, coordenador: apr.coordenador, gerente: apr.gerente, diretor: apr.diretor } : {}),
          },
        } });
        await qcLote.invalidateQueries({ queryKey: ["solicitacoes"] });
      } catch (e) {
        toast.error("Não foi possível salvar os dados do pedido: " + (e as Error).message, { duration: 10000 });
        return;
      }
    }
    setEditRc(null);
  };

  // Limpa por completo os dados de pedido (pedido cancelado / com erro) e devolve para "RC sem pedido"
  const limparDadosPedido = async (base: Solic) => {
    const chave = base.pedido_compra_id ?? (base.numero_pedido_compra?.trim() || null);
    const alvos = chave
      ? items.filter((x) => (x.pedido_compra_id ?? (x.numero_pedido_compra?.trim() || null)) === chave)
      : [base];
    const ok = window.confirm(
      `Limpar os dados do pedido de ${alvos.length} peça(s)?\n\nSerão apagados: nº do pedido, valor, fornecedor, prazo, transportadora/rastreio e o histórico de aprovação. As peças voltam para "RC sem pedido".`,
    );
    if (!ok) return;
    for (const s of alvos) {
      await upd.mutateAsync({
        id: s.id,
        patch: {
          numero_pedido_compra: null,
          valor_total: null,
          valor_item: null,
          fornecedor: null,
          pedido_compra_id: null,
          tipo_frete: null,
          transportadora: null,
          codigo_rastreio: null,
          link_rastreio: null,
          prazo_entrega: null,
          pedido_compra_path: null,
          comprador_id: null,
          comprador_at: null,
          aprovador_gestao_id: null,
          aprovador_gestao_at: null,
          liberacao_diretoria: false,
          liberacao_diretoria_at: null,
          motivo_reprovacao_gestao: null,
          status: "EM_TRATAMENTO_PCM",
        } as unknown as Partial<Solic>,
        msg: "",
      });
    }
    toast.success(`Dados do pedido limpos em ${alvos.length} peça(s) — voltaram para RC sem pedido`);
    setEditRc(null);
  };

  // Atualização em lote no Acompanhamento
  const aplicarLote = async (alvos: Solic[]) => {
    if (!alvos.length) return toast.error("Selecione ao menos uma linha");
    const os = loteForm.os_numero.trim().toUpperCase();
    const rc = loteForm.rc_numero.trim().toUpperCase();
    const ped = loteForm.numero_pedido_compra.trim().toUpperCase();
    const forn = loteForm.fornecedor.trim().toUpperCase();
    const prazo = loteForm.prazo_entrega;
    const st = loteForm.status;
    const valorNum = valorBRLParaNumero(loteForm.valor_total);
    const aprL = acharAprovador(aprovadores, loteForm.coordenador);
    if (!os && !rc && !ped && !forn && !prazo && !st && valorNum == null && !aprL && !loteEquip) return toast.error("Preencha ao menos um campo para atualizar");
    const patch: Record<string, unknown> = {};
    if (os) patch.os_numero = os;
    if (loteEquip) patch.equipamento_id = loteEquip.id;
    if (rc) { patch.rc_numero = rc; patch.em_cadastro = false; }
    if (ped) patch.numero_pedido_compra = ped;
    if (forn) patch.fornecedor = forn;
    if (prazo) patch.prazo_entrega = prazo;
    if (st) patch.status = st;
    if (valorNum != null) patch.valor_total = valorNum;
    // Atualiza todas as peças em uma única operação (antes era linha a linha e parava na primeira falha)
    const entrandoEmAprovacao = alvos.filter((s) => !!st && st.startsWith("PEDIDO_EM_APROVACAO") && s.status !== st).map((s) => s.id);
    const demais = alvos.filter((s) => !entrandoEmAprovacao.includes(s.id)).map((s) => s.id);
    try {
      if (demais.length) await salvarLote({ data: { ids: demais, patch } });
      if (entrandoEmAprovacao.length) {
        await salvarLote({ data: { ids: entrandoEmAprovacao, patch: { ...patch, aprovador_gestao_at: new Date().toISOString() } } });
      }
    } catch (e) {
      qcLote.invalidateQueries({ queryKey: ["solicitacoes"] });
      return toast.error("Não foi possível atualizar todas as linhas: " + (e as Error).message);
    }


    // Reflete no pedido de compra (cria/vincula quando a peça ainda não tem pedido)
    if (ped || forn || prazo || valorNum != null || aprL) {
      const grupos = new Map<string, string[]>();
      for (const s of alvos) {
        const chave = s.pedido_compra_id ?? ped ?? (s.numero_pedido_compra?.trim().toUpperCase() || "");
        if (!chave) continue;
        grupos.set(chave, [...(grupos.get(chave) ?? []), s.id]);
      }
      for (const [chave, ids] of grupos) {
        try {
          await salvarPedido({ data: {
            ids,
            numero_pedido_compra: ped || (chave.includes("-") ? null : chave),
            patch: {
              ...(forn ? { fornecedor: forn } : {}),
              ...(prazo ? { prazo_entrega: prazo } : {}),
              ...(valorNum != null ? { valor_total: valorNum } : {}),
              ...(aprL ? { bu: aprL.bu ?? null, coordenador: aprL.coordenador, gerente: aprL.gerente, diretor: aprL.diretor } : {}),
            },
          } });
        } catch (e) {
          toast.error("Falha ao atualizar pedido vinculado: " + (e as Error).message);
        }
      }
    }
    await qcLote.invalidateQueries({ queryKey: ["solicitacoes"] });
    toast.success(`${alvos.length} linha(s) atualizada(s)`);
    setSelAcomp([]);
    setLoteEquip(null);
    setLoteForm({ os_numero: "", rc_numero: "", numero_pedido_compra: "", valor_total: "", fornecedor: "", prazo_entrega: "", status: "", coordenador: "" });
  };


  // Lead times médios (em dias) sobre todos os itens
  const diffDias = (a?: string | null, b?: string | null) => {
    if (!a || !b) return null;
    return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  };
  const mediaArr = (arr: (number | null)[]) => {
    const v = arr.filter((n): n is number => n !== null && !isNaN(n) && n >= 0);
    if (!v.length) return null;
    return v.reduce((a, b) => a + b, 0) / v.length;
  };
  const lt = useMemo(() => ({
    solicitar_aprovar: mediaArr(items.map((s) => diffDias(s.created_at, s.supervisor_at))),
    aprovar_pcm: mediaArr(items.map((s) => diffDias(s.supervisor_at, s.pcm_at))),
    pcm_gestao: mediaArr(items.map((s) => diffDias(s.pcm_at, s.aprovador_gestao_at))),
    gestao_pedido: mediaArr(items.map((s) => diffDias(s.aprovador_gestao_at, s.comprador_at))),
    pedido_almox: mediaArr(items.map((s) => diffDias(s.comprador_at, s.data_recebimento_almox))),
    almox_entrega: mediaArr(items.map((s) => diffDias(s.data_recebimento_almox, s.data_entrega_mecanico))),
    total: mediaArr(items.map((s) => diffDias(s.created_at, s.data_entrega_mecanico))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items]);
  const fmtLt = (n: number | null) => n === null ? "—" : `${n.toFixed(1)} dias`;


  const salvarRc = async (itens: Solic[], rcNumero: string) => {
    if (!rcNumero.trim()) return toast.error("Informe o Nº RC antes de salvar");
    const num = rcNumero.trim().toUpperCase();
    for (const s of itens) {
      // Ao salvar a RC a peça deixa de estar "EM CADASTRO" automaticamente
      await upd.mutateAsync({ id: s.id, patch: { rc_numero: num, em_cadastro: false }, msg: "" });
    }
    toast.success(`RC ${num} salva em ${itens.length} peça(s). A tag EM CADASTRO foi removida.`);
  };

  const confirmarCancelamento = async () => {
    if (!cancelModal) return;
    if (!motivoCancel.trim()) return toast.error("Informe o motivo do cancelamento");
    const motivo = `CANCELADA PELO PCM: ${motivoCancel.trim().toUpperCase()}`;
    for (const s of cancelModal.itens) {
      await upd.mutateAsync({ id: s.id, patch: {
        status: "CANCELADA",
        motivo_reprovacao_gestao: motivo,
        pcm_motivo_pendencia: motivo,
      }, msg: "" });
    }
    toast.success(`${cancelModal.itens.length} item(ns) cancelado(s) e removido(s) do controle.`);
    setCancelModal(null);
    setMotivoCancel("");
  };


  const marcarTratada = async (s: Solic, rcNumero: string) => {
    if (!rcNumero.trim()) return toast.error("Informe o Nº RC do bloco antes de tratar");
    await upd.mutateAsync({ id: s.id, patch: {
      status: "EM_TRATAMENTO_PCM",
      rc_numero: rcNumero.trim().toUpperCase(),
      pcm_at: new Date().toISOString(),
      em_cadastro: false,
    }, msg: "" });
    toast.success(`Peça tratada em ${new Date().toLocaleDateString("pt-BR")}`);
  };



  // Acompanhamento (dashboard) — finalizadas SEMPRE aparecem; reprovadas/canceladas são opcionais
  const [incluirEncerradas, setIncluirEncerradas] = useState(false);
  const emAndamento = useMemo(
    () => (incluirEncerradas ? items : items.filter((s) => !["REPROVADA", "CANCELADA"].includes(s.status))),
    [items, incluirEncerradas],
  );
  // Quantas peças compartilham o mesmo pedido de compra (o valor_total é do pedido inteiro, não da peça)
  const itensPorPedido = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of items) {
      const pid = (s as { pedido_compra_id?: string | null }).pedido_compra_id;
      if (pid) m.set(pid, (m.get(pid) ?? 0) + 1);
    }
    return m;
  }, [items]);
  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const { contaAtrasadas, contaHoje } = useMemo(() => {
    const chegou = ["RECEBIDA_ALMOX", "ENTREGUE_MECANICO", "FINALIZADA"];
    let atr = 0, hj = 0;
    for (const s of emAndamento) {
      if (!s.prazo_entrega || chegou.includes(s.status)) continue;
      const p = new Date(s.prazo_entrega).getTime();
      if (p < hoje.getTime()) atr++;
      else if (p === hoje.getTime()) hj++;
    }
    return { contaAtrasadas: atr, contaHoje: hj };
  }, [emAndamento, hoje]);
  const grupos = [
    { titulo: "Aguardando Supervisor", st: ["SOLICITADA"] },
    { titulo: "Fila PCM", st: ["APROVADA_SUPERVISOR"] },
    { titulo: "RC GERADA (sem pedido)", st: ["RC_GERADA"] },
    { titulo: "Devolvidas ao solicitante", st: ["PENDENCIA_SOLICITANTE"] },
    { titulo: "Em aprovação (Coord/Ger/Dir)", st: ["PEDIDO_EM_APROVACAO_COORD", "PEDIDO_EM_APROVACAO_GERENTE", "PEDIDO_EM_APROVACAO_DIRETORIA"] },
    { titulo: "Liberadas para envio (c/ pedido)", st: ["LIB_COMPRADOR"] },
    { titulo: "Enviado ao fornecedor", st: ["PEDIDO_COLOCADO", "EM_TRANSITO"] },
    { titulo: "Recebidas no almox", st: ["RECEBIDA_ALMOX"] },
    { titulo: "Entregues ao solicitante", st: ["ENTREGUE_MECANICO"] },
  ];
  const [filtro, setFiltro] = useState("");
  const [subPcm, setSubPcm] = useState<"TRATATIVA" | "RESERVA" | "ACOMPANHAMENTO" | "SUGESTAO" | "SERVICOS" | "SAP" | "CANCELADAS" | Fase>("TRATATIVA");
  const faseAtual: Fase | null = (["RC_SEM_PEDIDO", "EM_APROVACAO", "APROVADOS", "ENVIADOS"] as string[]).includes(subPcm) ? (subPcm as Fase) : null;
  // Filtro por data (aplicado à data da fase / data da RC)
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  // Marcar como enviado (exige prazo de entrega)
  const [envioModal, setEnvioModal] = useState<Solic[] | null>(null);
  const [envioPrazo, setEnvioPrazo] = useState("");
  // Rejeição registrada pelo PCM (aprovador rejeitou fora do portal)
  const [rejModal, setRejModal] = useState<Solic[] | null>(null);
  const [rejMotivo, setRejMotivo] = useState("");

  // Itens do mesmo pedido de compra (as ações de aprovação valem para o pedido inteiro)
  const irmasDoPedido = (s: Solic) => {
    const chave = s.pedido_compra_id ?? (s.numero_pedido_compra?.trim() || null);
    if (!chave) return [s];
    return items.filter((x) => (x.pedido_compra_id ?? (x.numero_pedido_compra?.trim() || null)) === chave);
  };

  // Avança a instância de aprovação conforme a alçada de valor
  const avancarAprovacao = async (s: Solic) => {
    const alvos = irmasDoPedido(s).filter((x) => x.status.startsWith("PEDIDO_EM_APROVACAO"));
    if (!alvos.length) return;
    const valor = valorDe(s) ?? 0;
    const atual = s.status;
    const proximo: Solic["status"] =
      atual === "PEDIDO_EM_APROVACAO_COORD"
        ? (valor > 5000 ? "PEDIDO_EM_APROVACAO_GERENTE" : "PEDIDO_APROVADO_GESTAO")
        : atual === "PEDIDO_EM_APROVACAO_GERENTE"
          ? (valor > 20000 ? "PEDIDO_EM_APROVACAO_DIRETORIA" : "PEDIDO_APROVADO_GESTAO")
          : "PEDIDO_APROVADO_GESTAO";
    const agora = new Date().toISOString();
    for (const a of alvos) {
      await upd.mutateAsync({ id: a.id, patch: { status: proximo, aprovador_gestao_at: agora }, msg: "" });
    }
    toast.success(proximo === "PEDIDO_APROVADO_GESTAO"
      ? `Aprovação concluída — envio solicitado em ${new Date().toLocaleDateString("pt-BR")}`
      : `Aprovado por ${nivelAprovacaoLabel(atual)} — segue para ${nivelAprovacaoLabel(proximo)} em ${new Date().toLocaleDateString("pt-BR")}`);
  };

  const confirmarRejeicaoAprovador = async () => {
    if (!rejModal) return;
    if (!rejMotivo.trim()) return toast.error("Informe o motivo da rejeição");
    const motivo = `PEDIDO REJEITADO NA APROVAÇÃO: ${rejMotivo.trim().toUpperCase()}`;
    for (const a of rejModal) {
      await upd.mutateAsync({ id: a.id, patch: {
        status: "PEDIDO_REPROVADO_GESTAO",
        motivo_reprovacao_gestao: motivo,
      }, msg: "" });
    }
    toast.success("Pedido marcado como rejeitado — pode ser reenviado para aprovação");
    setRejModal(null);
    setRejMotivo("");
  };

  const confirmarEnvio = async () => {
    if (!envioModal) return;
    if (!envioPrazo) return toast.error("Informe o prazo de entrega");
    const agora = new Date().toISOString();
    for (const a of envioModal) {
      await upd.mutateAsync({ id: a.id, patch: {
        status: "PEDIDO_COLOCADO",
        comprador_at: agora,
        prazo_entrega: envioPrazo,
      }, msg: "" });
    }
    toast.success(`Marcado como enviado em ${new Date().toLocaleDateString("pt-BR")} · entrega prevista ${new Date(envioPrazo + "T00:00:00").toLocaleDateString("pt-BR")}`);
    setEnvioModal(null);
    setEnvioPrazo("");
  };

  // Canceladas / rejeitadas (inclui as que já tinham RC)
  const [buscaCancel, setBuscaCancel] = useState("");
  const buscaCancelDef = useDeferredValue(buscaCancel);
  const [soComRc, setSoComRc] = useState(false);
  const canceladasTodas = useMemo(
    () => items
      .filter((s) => s.status === "REPROVADA" || s.status === "CANCELADA_SUPERVISOR" || s.status === "CANCELADA")
      .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime()),
    [items],
  );
  const canceladasFiltradas = useMemo(() => {
    const f = buscaCancelDef.trim().toLowerCase();
    return canceladasTodas.filter((s) => {
      if (soComRc && !s.rc_numero) return false;
      if (!f) return true;
      const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null } }).equipamento;
      const sol = (s as { solicitante?: { nome?: string } }).solicitante?.nome ?? "";
      return [s.os_numero, s.descricao, s.codigo_peca ?? "", s.rc_numero ?? "", s.numero_pedido_compra ?? "", eq?.prefixo_interno ?? "", eq?.codigo_armac ?? "", sol, s.motivo_reprovacao_gestao ?? "", s.motivo_reprovacao_supervisor ?? ""]
        .join(" ").toLowerCase().includes(f);
    });
  }, [canceladasTodas, buscaCancelDef, soComRc]);

  const [reservas, setReservas] = useState<Record<string, string>>({});
  const [selReserva, setSelReserva] = useState<string[]>([]);
  const enviarReserva = async (alvos: Solic[], reserva: string) => {
    if (!reserva.trim()) return toast.error("Informe o Nº da Reserva");
    if (!alvos.length) return toast.error("Selecione ao menos uma peça");
    const num = reserva.trim().toUpperCase();
    const now = new Date().toISOString();
    for (const s of alvos) {
      await upd.mutateAsync({ id: s.id, patch: {
        status: "PEDIDO_EM_APROVACAO_COORD",
        reserva_numero: num,
        rc_numero: null,
        pcm_at: now,
      }, msg: "" });
    }
    setSelReserva((c) => c.filter((id) => !alvos.some((a) => a.id === id)));
    toast.success(`${alvos.length} peça(s) enviada(s) para aprovação com a reserva ${num}`);
  };
  const [statusFiltro, setStatusFiltro] = useState<string>("ALL");
  const [alertaFiltro, setAlertaFiltro] = useState<"ALL" | "ATRASADAS" | "HOJE" | "SEM_PRAZO" | "COM_PRAZO">("ALL");
  const [valorFiltro, setValorFiltro] = useState<"ALL" | "ATE_5000" | "ACIMA_5000" | "SEM_VALOR">("ALL");
  // Várias máquinas ao mesmo tempo, separadas por vírgula
  const [maqFiltro, setMaqFiltro] = useState("");
  const maqLista = useMemo(() => maqFiltro.split(/[,;\n]/).map(normMaq).filter(Boolean), [maqFiltro]);

  const [limite, setLimite] = useState(200);
  const filtroDeferido = useDeferredValue(filtro);
  useEffect(() => { setLimite(200); }, [filtroDeferido, statusFiltro, alertaFiltro, valorFiltro, subPcm, dataDe, dataAte]);

  const statusSelecionados = useMemo(
    () => (statusFiltro === "ALL" ? [] : statusFiltro.split("|")),
    [statusFiltro],
  );
  // Base das abas por fase: usa todas as solicitações (não só "em andamento")
  const baseFase = useMemo(
    () => (faseAtual ? items.filter((s) => faseDe(s) === faseAtual) : emAndamento),
    [items, emAndamento, faseAtual],
  );
  const filtradas = useMemo(() => {
    const hojeMs = hoje.getTime();
    const f = filtroDeferido.trim().toLowerCase();
    const de = dataDe ? new Date(dataDe + "T00:00:00").getTime() : null;
    const ate = dataAte ? new Date(dataAte + "T23:59:59").getTime() : null;
    const lista = baseFase.filter((s) => {
      if (de !== null || ate !== null) {
        const ref = faseAtual ? dataFaseDe(s, faseAtual) : (s.pcm_at ?? s.created_at);
        const t = ref ? new Date(ref).getTime() : null;
        if (t === null) return false;
        if (de !== null && t < de) return false;
        if (ate !== null && t > ate) return false;
      }
      if (statusSelecionados.length > 0 && !statusSelecionados.some((k) => casaStatusChave(s, k))) return false;
      if (alertaFiltro !== "ALL") {
        const prazo = s.prazo_entrega ? new Date(s.prazo_entrega) : null;
        const chegou = ["RECEBIDA_ALMOX", "ENTREGUE_MECANICO", "FINALIZADA"].includes(s.status);
        if (alertaFiltro === "ATRASADAS" && !(prazo && prazo.getTime() < hojeMs && !chegou)) return false;
        if (alertaFiltro === "HOJE" && !(prazo && prazo.getTime() === hojeMs && !chegou)) return false;
        if (alertaFiltro === "SEM_PRAZO" && prazo) return false;
        if (alertaFiltro === "COM_PRAZO" && !prazo) return false;
      }
      if (valorFiltro !== "ALL") {
        const v = valorDe(s);
        if (valorFiltro === "SEM_VALOR" && v != null) return false;
        if (valorFiltro === "ATE_5000" && !(v != null && v <= 5000)) return false;
        if (valorFiltro === "ACIMA_5000" && !(v != null && v > 5000)) return false;
      }
      const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null } }).equipamento;
      if (maqLista.length > 0) {
        const p = normMaq(eq?.prefixo_interno), a = normMaq(eq?.codigo_armac);
        if (!maqLista.some((m) => m === p || m === a)) return false;
      }
      if (!f) return true;
      const sol = (s as { solicitante?: { nome?: string } }).solicitante?.nome ?? "";
      return [s.os_numero, s.descricao, s.codigo_peca ?? "", s.rc_numero ?? "", s.numero_pedido_compra ?? "", eq?.prefixo_interno ?? "", eq?.codigo_armac ?? "", sol, s.fornecedor ?? ""]
        .join(" ").toLowerCase().includes(f);
    });
    // Mais recentes sempre no topo
    const chaveOrdem = (s: Solic) => {
      const ref = (faseAtual ? dataFaseDe(s, faseAtual) : null) ?? s.pcm_at ?? s.created_at;
      return ref ? new Date(ref).getTime() : 0;
    };
    return [...lista].sort((a, b) => chaveOrdem(b) - chaveOrdem(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFase, faseAtual, statusSelecionados, alertaFiltro, valorFiltro, filtroDeferido, dataDe, dataAte, maqLista]);
  const visiveis = useMemo(() => filtradas.slice(0, limite), [filtradas, limite]);



  return (
    <div className="space-y-8">
      {ehFerramentaria && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>🔧 Ferramentaria</b> — compras <b>Indiretas</b> (uso da oficina) e todas as solicitações de <b>TELES</b>.
          A RC gerada aqui segue o mesmo fluxo de pedido.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {([["TRATATIVA", "🛠 Tratativas (RC)"], ["RESERVA", "📦 Reserva Almox"], ["ACOMPANHAMENTO", "📊 Acompanhamento"], ["SUGESTAO", "📈 Sugestão de compras"], ["SERVICOS", "🧰 Serviços de terceiros"], ["SAP", "📥 Importar SAP"], ["CANCELADAS", `🗑 Canceladas / Rejeitadas (${canceladasTodas.length})`]] as const).map(([k, label]) => (
          <Button key={k} size="sm" variant={subPcm === k ? "default" : "outline"} onClick={() => setSubPcm(k)}>{label}</Button>
        ))}
        <div className="ml-auto"><NovaRequisicaoPcm /></div>
      </div>
      <div className="flex flex-wrap gap-2 border-t pt-2">
        {(["RC_SEM_PEDIDO", "EM_APROVACAO", "APROVADOS", "ENVIADOS"] as Fase[]).map((f) => {
          const qtd = items.filter((s) => faseDe(s) === f).length;
          return (
            <Button key={f} size="sm" variant={subPcm === f ? "default" : "secondary"} onClick={() => setSubPcm(f)}>
              {FASE_LABEL[f]} ({qtd})
            </Button>
          );
        })}
      </div>

      {subPcm === "SUGESTAO" && <SugestaoComprasTab items={items as never} />}
      {subPcm === "SERVICOS" && <ServicosTerceirosTab items={items as never} />}
      {subPcm === "SAP" && <ImportarSapTab items={items as never} onChange={onChange} />}



      {subPcm === "ACOMPANHAMENTO" && (
      <section className="space-y-2">

        <h3 className="text-sm font-semibold">⏱ Lead Times médios por etapa</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          <Card><CardHeader className="pb-2"><CardDescription>Solicitação → Supervisor</CardDescription><CardTitle className="text-lg">{fmtLt(lt.solicitar_aprovar)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Supervisor → PCM</CardDescription><CardTitle className="text-lg">{fmtLt(lt.aprovar_pcm)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>PCM → Aprovação</CardDescription><CardTitle className="text-lg">{fmtLt(lt.pcm_gestao)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Aprovação → Pedido</CardDescription><CardTitle className="text-lg">{fmtLt(lt.gestao_pedido)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Pedido → Almox</CardDescription><CardTitle className="text-lg">{fmtLt(lt.pedido_almox)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Almox → Solicitante</CardDescription><CardTitle className="text-lg">{fmtLt(lt.almox_entrega)}</CardTitle></CardHeader></Card>
          <Card className="border-primary"><CardHeader className="pb-2"><CardDescription>Total do ciclo</CardDescription><CardTitle className="text-lg text-primary">{fmtLt(lt.total)}</CardTitle></CardHeader></Card>
        </div>
      </section>
      )}

      {subPcm === "TRATATIVA" && (
      <section className="space-y-4">


        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">🛠 Tratativas pendentes — {blocos.length} OS ({emAcao.length} peças)</h3>
          <BuscaMaterialAlmox label="🔎 Consultar estoques (SAP · sem giro · supervisão)" className="" permitirBaixa />
        </div>
        {blocos.length === 0 && <p className="text-sm text-muted-foreground">Sem OS aguardando tratativa.</p>}
        {blocos.map((b) => {
          const rcSugerida = rcs[b.key] ?? "";
          const rcNorm = rcSugerida.trim().toUpperCase();
          const selecionadas = b.itens.filter((i) => selRc[i.id]);
          const alvo = selecionadas.length ? selecionadas : b.itens;
          const alvoComRc = alvo.every((i) => !!(i.rc_numero ?? "").trim() || !!(rcItem[i.id] ?? "").trim()) || !!rcNorm;
          const dono = b.itens.map((i) => i as unknown as { tratativa_por?: string | null; tratativa_por_nome?: string | null; tratativa_at?: string | null }).find((i) => !!i.tratativa_por);
          const meuDono = !!dono && !!me && dono.tratativa_por === me.id;
          return (
            <Card key={b.key} className={dono ? (meuDono ? "border-green-500" : "border-amber-500") : undefined}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">🔧 {b.equipNome}</CardTitle>
                <CardDescription>OS <b>{b.os}</b> · Solicitante {b.solicitante} · {b.itens.length} peça(s) pendente(s)</CardDescription>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {dono ? (
                    <Badge className={meuDono ? "bg-green-600 text-white" : "bg-amber-500 text-white"}>
                      {meuDono ? "🙋 Você está tratando" : `🔒 Em tratativa por ${dono.tratativa_por_nome ?? "outro PCM"}`}
                      {dono.tratativa_at ? ` · desde ${fmtData(dono.tratativa_at)}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Sem responsável</Badge>
                  )}
                  {!dono && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={upd.isPending} onClick={() => definirTratativa(b.itens, false)}>
                      🙋 Assumir tratativa
                    </Button>
                  )}
                  {dono && meuDono && (
                    <Button size="sm" variant="outline" disabled={upd.isPending} onClick={() => definirTratativa(b.itens, true)}>
                      Liberar tratativa
                    </Button>
                  )}
                  {dono && !meuDono && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-500 text-amber-700 hover:bg-amber-50"
                      disabled={upd.isPending}
                      onClick={() => { if (window.confirm(`${dono.tratativa_por_nome ?? "Outro PCM"} está tratando esta OS. Assumir mesmo assim?`)) definirTratativa(b.itens, false); }}
                    >
                      Assumir mesmo assim
                    </Button>
                  )}
                </div>
                <div className="mt-2">
                  <Label className="text-xs">Nº RC para aplicar em lote {selecionadas.length ? `(${selecionadas.length} selecionada(s))` : "(todas as peças)"}</Label>
                  <Input value={rcSugerida} onChange={(e) => setRcs((cur) => ({ ...cur, [b.key]: e.target.value.toUpperCase() }))} placeholder="EX: RC-2026-0123" className="uppercase" />
                  <p className="mt-1 text-[11px] text-muted-foreground">Se o orçamento passar de 10 itens, selecione as peças de cada RC e salve em lotes — cada peça pode ter sua própria RC.</p>
                </div>
              </CardHeader>

              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={b.itens.every((i) => selRc[i.id])}
                      onCheckedChange={(v) => setSelRc((c) => { const n = { ...c }; for (const i of b.itens) n[i.id] = !!v; return n; })}
                    />
                    Marcar todas · {b.itens.length} peça(s) pendente(s)
                    {selecionadas.length > 0 && <span className="font-semibold text-primary">{selecionadas.length} selecionada(s)</span>}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-primary text-primary hover:bg-primary/10"
                      disabled={upd.isPending}
                      onClick={() => salvarRc(alvo, rcSugerida)}
                    >
                      💾 Salvar RC {rcNorm ? `${rcNorm} ` : ""}em {alvo.length} peça(s)
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      disabled={upd.isPending || !alvoComRc}
                      title={alvoComRc ? "" : "Digite o Nº RC (do bloco ou de cada peça) antes de enviar"}
                      onClick={async () => {
                        const faltando = alvo.filter((s) => !((s.rc_numero ?? "").trim() || (rcItem[s.id] ?? "").trim() || rcNorm));
                        if (faltando.length) return toast.error("Informe o Nº RC antes de enviar para pedido");
                        for (const s of alvo) {
                          const rc = (s.rc_numero ?? "").trim() || (rcItem[s.id] ?? "").trim() || rcNorm;
                          await marcarTratada(s, rc);
                        }
                      }}
                    >
                      📤 Enviar para pedido ({alvo.length})
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500 text-red-700 hover:bg-red-50"
                      disabled={upd.isPending}
                      onClick={() => { setCancelModal({ itens: b.itens, titulo: `OS ${b.os} · ${b.equipNome} (${b.itens.length} peça(s))` }); setMotivoCancel(""); }}
                    >
                      🗑 Cancelar RC (OS inteira)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      title="Baixar lista de peças desta OS para pedir cotação ao fornecedor"
                      onClick={() => exportarCotacao(b.itens)}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" /> Lista p/ cotação
                    </Button>
                  </div>
                </div>
                {b.itens.map((s) => {
                  const rcDoItem = rcItem[s.id] ?? s.rc_numero ?? "";
                  const itemSalvo = !!s.rc_numero && rcDoItem.trim().toUpperCase() === s.rc_numero.toUpperCase();
                  return (
                  <ItemLinha key={s.id} s={s} actions={
                    <div className="flex w-full flex-col items-stretch gap-2">

                      <label className="flex items-center gap-2 rounded border px-2 py-1 text-xs font-medium cursor-pointer hover:bg-muted/60">
                        <Checkbox checked={!!selRc[s.id]} onCheckedChange={(v) => setSelRc((c) => ({ ...c, [s.id]: !!v }))} />
                        Selecionar p/ lote
                      </label>
                      <BuscaMaterialAlmox
                        label="🔎 Estoques"
                        className="w-full"
                        permitirBaixa
                        termoInicial={(s.codigo_peca ?? "").trim() || s.descricao}
                      />

                      <div className="flex items-center gap-1">
                        <Input
                          value={rcDoItem}
                          onChange={(e) => setRcItem((c) => ({ ...c, [s.id]: e.target.value.toUpperCase() }))}
                          placeholder="RC desta peça"
                          className="h-8 min-w-0 flex-1 uppercase text-xs"
                        />
                        <Button size="sm" variant="outline" className="shrink-0" disabled={upd.isPending || !rcDoItem.trim()} onClick={() => salvarRc([s], rcDoItem)}>💾</Button>
                        {itemSalvo && <span className="shrink-0 text-xs font-semibold text-green-700">✔ {s.rc_numero}</span>}
                      </div>

                      {(() => {
                        const rcEnvio = (s.rc_numero ?? "").trim() || rcDoItem.trim() || rcNorm;
                        return (
                          <label className={`flex items-center gap-2 rounded border px-2 py-1 text-xs font-medium ${rcEnvio ? "border-green-600 bg-green-50 text-green-800 cursor-pointer hover:bg-green-100" : "border-muted bg-muted/40 text-muted-foreground cursor-not-allowed"}`}>
                            <Checkbox
                              checked={false}
                              disabled={!rcEnvio}
                              onCheckedChange={(v) => { if (v) marcarTratada(s, rcEnvio); }}
                            />
                            Enviar esta peça para pedido
                          </label>
                        );
                      })()}

                      {(() => {
                        const emCad = !!(s as { em_cadastro?: boolean }).em_cadastro;
                        return (
                          <Button
                            size="sm"
                            className={emCad ? "bg-red-600 font-bold text-white hover:bg-red-700 animate-pulse" : "border border-red-500 bg-transparent text-red-700 hover:bg-red-50"}
                            disabled={upd.isPending}
                            title="Marcar que a peça está em processo de cadastro de material"
                            onClick={() => upd.mutate({ id: s.id, patch: { em_cadastro: !emCad }, msg: emCad ? "Cadastro concluído" : "Marcada como EM CADASTRO" })}
                          >
                            {emCad ? "🔴 EM CADASTRO — clique p/ concluir" : "🔴 Marcar EM CADASTRO"}
                          </Button>
                        );
                      })()}
                      <Button size="sm" variant="outline" className="border-blue-500 text-blue-700 hover:bg-blue-50" title="Corrigir código, descrição ou quantidade informada pelo mecânico" onClick={() => abrirEditPeca(s)}>✏️ Corrigir peça</Button>
                      <Button size="sm" variant="outline" className="border-orange-500 text-orange-700 hover:bg-orange-50" onClick={() => { setPendModal(s); setMotivoPend(""); }}>⚠ Devolver ao solicitante</Button>

                      <Button size="sm" variant="ghost" className="justify-center text-red-700 hover:bg-red-50" title="Cancelar esta peça (remove do controle)" onClick={() => { setCancelModal({ itens: [s], titulo: `${s.descricao} — OS ${s.os_numero}` }); setMotivoCancel(""); }}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Cancelar peça
                      </Button>

                    </div>
                  } />
                  );
                })}
                <p className="text-xs text-muted-foreground">1) Selecione as peças (ou deixe todas) → digite o Nº RC → <b>Salvar RC</b>. Cada peça também tem seu campo de RC individual. 2) Depois de conferir, clique em <b>Enviar para pedido</b> (em lote ou peça por peça).</p>

              </CardContent>

            </Card>
          );
        })}
      </section>
      )}

      {subPcm === "RESERVA" && (
      <section className="space-y-4">
        <div className="rounded border border-sky-300 bg-sky-50 p-3 text-xs text-sky-900">
          Use esta aba quando o material <b>já existe no almoxarifado</b> e não precisa de compra. Informe o <b>Nº da Reserva</b> no lugar da RC e envie direto para aprovação. Após aprovada, a peça é liberada no almox e o solicitante é avisado com o número da reserva.
        </div>
        <h3 className="text-sm font-semibold">📦 Materiais para reserva — {blocos.length} OS ({emAcao.length} peças)</h3>
        {blocos.length === 0 && <p className="text-sm text-muted-foreground">Sem OS aguardando tratativa.</p>}
        {blocos.map((b) => {
          const res = reservas[b.key] ?? "";
          const sel = b.itens.filter((i) => selReserva.includes(i.id));
          return (
            <Card key={b.key}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">🔧 {b.equipNome}</CardTitle>
                <CardDescription>OS <b>{b.os}</b> · Solicitante {b.solicitante} · {b.itens.length} peça(s)</CardDescription>
                <div className="mt-2">
                  <Label className="text-xs">Nº da Reserva (almoxarifado)</Label>
                  <Input value={res} onChange={(e) => setReservas((c) => ({ ...c, [b.key]: e.target.value.toUpperCase() }))} placeholder="EX: RES-2026-0123" className="uppercase" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {b.itens.map((s) => (
                  <ItemLinha key={s.id} s={s} actions={
                    <label className="flex cursor-pointer items-center gap-2 rounded border border-sky-600 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100">
                      <Checkbox
                        checked={selReserva.includes(s.id)}
                        onCheckedChange={(v) => setSelReserva((c) => (v ? [...c, s.id] : c.filter((x) => x !== s.id)))}
                      />
                      Tem no almox
                    </label>
                  } />
                ))}
                <Button size="sm" className="bg-sky-600 hover:bg-sky-700" disabled={upd.isPending} onClick={() => enviarReserva(sel.length ? sel : b.itens, res)}>
                  📦 Enviar {sel.length ? `${sel.length} peça(s)` : "todas"} p/ aprovação com reserva
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>
      )}

      {subPcm === "CANCELADAS" && (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">🗑 Peças / RCs canceladas ou rejeitadas — {canceladasFiltradas.length} de {canceladasTodas.length}</h3>
        <p className="text-xs text-muted-foreground">
          Aqui ficam as peças canceladas pelo PCM (mesmo com RC já aberta) e as rejeitadas pelo supervisor ou pela gestão. Nada é apagado — dá para reativar e voltar à fila.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Buscar por RC, OS, peça, código, máquina, solicitante ou motivo..."
            className="max-w-md"
            value={buscaCancel}
            onChange={(e) => setBuscaCancel(e.target.value)}
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" className="h-4 w-4" checked={soComRc} onChange={(e) => setSoComRc(e.target.checked)} />
            Somente com RC aberta
          </label>
        </div>
        {canceladasFiltradas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma peça cancelada nesse filtro.</p>}
        <div className="space-y-2">
          {canceladasFiltradas.slice(0, 300).map((s) => {
            const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null } }).equipamento;
            const sol = (s as { solicitante?: { nome?: string } }).solicitante?.nome ?? "—";
            const mot = s.motivo_reprovacao_gestao ?? s.motivo_reprovacao_supervisor ?? s.pcm_motivo_pendencia ?? null;
            return (
              <div key={s.id} className="rounded border bg-muted/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{s.descricao}</span>
                      <Badge variant="destructive">{s.status === "CANCELADA_SUPERVISOR" ? "REJEITADO PELO SUPERVISOR" : s.status === "CANCELADA" ? "CANCELADA" : "CANCELADA / REJEITADA"}</Badge>
                      {s.rc_numero && <Badge variant="outline">RC {s.rc_numero}</Badge>}
                      {s.numero_pedido_compra && <Badge variant="outline">PED {s.numero_pedido_compra}</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      OS {s.os_numero} · Qtd {s.quantidade} {s.unidade}
                      {s.codigo_peca ? ` · cód. ${s.codigo_peca}` : ""}
                      {" · "}Máq. <b>{eq?.prefixo_interno ?? "?"}</b>{eq?.codigo_armac ? ` · cod. ${eq.codigo_armac}` : ""}
                      {" · "}Solicitante: {sol}
                    </div>
                    {mot && <div className="mt-1 rounded bg-rose-50 p-1.5 text-xs text-rose-800"><b>Motivo:</b> {mot}</div>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={upd.isPending}
                    onClick={() => upd.mutate({
                      id: s.id,
                      patch: { status: "APROVADA_SUPERVISOR", motivo_reprovacao_gestao: null, pcm_motivo_pendencia: null },
                      msg: "Peça reativada — voltou para a fila de tratativa do PCM",
                    })}
                  >
                    ♻ Reativar p/ tratativa
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {canceladasFiltradas.length > 300 && (
          <p className="text-xs text-muted-foreground">Mostrando as 300 mais recentes — refine a busca para ver as demais.</p>
        )}
      </section>
      )}



      {(subPcm === "ACOMPANHAMENTO" || faseAtual) && (
      <section className="space-y-3">
        {faseAtual && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <b>{FASE_LABEL[faseAtual]}</b> — {filtradas.length} peça(s). Mais recentes no topo.
          </div>
        )}
        {!faseAtual && (<>
        <div className="flex flex-wrap items-center justify-between gap-2">

          <h3 className="text-sm font-semibold">📊 Acompanhamento — {incluirEncerradas ? "todas as solicitações (inclui canceladas / reprovadas)" : "em andamento e finalizadas"}</h3>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" className="h-4 w-4" checked={incluirEncerradas} onChange={(e) => setIncluirEncerradas(e.target.checked)} />
              Mostrar canceladas / reprovadas
            </label>
            <span className="text-xs text-muted-foreground">{emAndamento.length} solicitações</span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button type="button" onClick={() => setAlertaFiltro(alertaFiltro === "ATRASADAS" ? "ALL" : "ATRASADAS")}
            className={`text-left rounded border bg-card transition hover:border-red-500 ${alertaFiltro === "ATRASADAS" ? "border-red-500 ring-2 ring-red-200" : "border-red-500"}`}>
            <CardHeader className="pb-2"><CardDescription>🚨 Prazos vencidos {alertaFiltro === "ATRASADAS" && <span className="ml-1 text-[10px] font-semibold text-red-600">(filtrando)</span>}</CardDescription><CardTitle className={contaAtrasadas ? "text-red-600 animate-pulse" : ""}>{contaAtrasadas}</CardTitle></CardHeader>
          </button>
          <button type="button" onClick={() => setAlertaFiltro(alertaFiltro === "HOJE" ? "ALL" : "HOJE")}
            className={`text-left rounded border bg-card transition hover:border-amber-500 ${alertaFiltro === "HOJE" ? "border-amber-500 ring-2 ring-amber-200" : "border-amber-500"}`}>
            <CardHeader className="pb-2"><CardDescription>📦 Entregas hoje {alertaFiltro === "HOJE" && <span className="ml-1 text-[10px] font-semibold text-amber-600">(filtrando)</span>}</CardDescription><CardTitle className={contaHoje ? "text-amber-600" : ""}>{contaHoje}</CardTitle></CardHeader>
          </button>
          <Card><CardHeader className="pb-2"><CardDescription>🔧 Fila PCM (tratar)</CardDescription><CardTitle>{blocos.length} OS</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>💰 Em aprovação financeira</CardDescription><CardTitle>{emAndamento.filter((s) => s.status.startsWith("PEDIDO_EM_APROVACAO")).length}</CardTitle></CardHeader></Card>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {grupos.map((g) => {
            const n = emAndamento.filter((s) => g.st.some((k) => casaStatusChave(s, k))).length;
            const chave = g.st.join("|");
            const ativo = statusFiltro === chave;
            return (
              <button key={g.titulo} type="button" onClick={() => setStatusFiltro(ativo ? "ALL" : chave)}
                className={`rounded border bg-card p-2 text-left hover:border-primary ${ativo ? "border-primary ring-2 ring-primary/20" : ""}`}>
                <div className="text-xs text-muted-foreground">{g.titulo}</div>
                <div className="text-lg font-semibold">{n}</div>
              </button>
            );
          })}
        </div>
        </>)}

        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar por OS, RC, PED, peça, equipamento, solicitante..." className="max-w-md" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          <Input placeholder="Máquinas: EG 170, EG 200, EG 315..." title="Digite várias máquinas separadas por vírgula" className="w-72 uppercase" value={maqFiltro} onChange={(e) => setMaqFiltro(e.target.value.toUpperCase())} />
          <select
            value={statusSelecionados.length > 1 ? "ALL" : statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            className="h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">Todos os status</option>
            <option value="RC_GERADA">RC CRIADA (sem pedido)</option>
            <option value="LIB_COMPRADOR">PEDIDO APROVADO — ENVIAR (com pedido)</option>
            {Object.entries(STATUS_LABEL).filter(([k]) => (incluirEncerradas ? !["EM_TRATAMENTO_PCM", "PEDIDO_APROVADO_GESTAO"].includes(k) : !["REPROVADA", "CANCELADA", "EM_TRATAMENTO_PCM", "PEDIDO_APROVADO_GESTAO"].includes(k))).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={alertaFiltro}
            onChange={(e) => setAlertaFiltro(e.target.value as typeof alertaFiltro)}
            className="h-9 w-56 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">🔔 Todos os alertas</option>
            <option value="ATRASADAS">🚨 Apenas atrasadas</option>
            <option value="HOJE">📦 Chegam hoje</option>
            <option value="COM_PRAZO">📅 Com prazo definido</option>
            <option value="SEM_PRAZO">⚠️ Sem prazo definido</option>
          </select>
          <select
            value={valorFiltro}
            onChange={(e) => setValorFiltro(e.target.value as typeof valorFiltro)}
            className="h-9 w-56 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">💰 Todos os valores</option>
            <option value="ATE_5000">R$ 0 a R$ 5.000</option>
            <option value="ACIMA_5000">Acima de R$ 5.000</option>
            <option value="SEM_VALOR">Sem valor informado</option>
          </select>
          <div className="flex items-center gap-1">
            <Label className="text-xs whitespace-nowrap">Data de</Label>
            <Input type="date" className="h-9 w-40" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
            <Label className="text-xs whitespace-nowrap">até</Label>
            <Input type="date" className="h-9 w-40" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
          </div>
          {(alertaFiltro !== "ALL" || statusFiltro !== "ALL" || valorFiltro !== "ALL" || filtro || dataDe || dataAte || maqFiltro) && (
            <Button size="sm" variant="ghost" onClick={() => { setAlertaFiltro("ALL"); setStatusFiltro("ALL"); setValorFiltro("ALL"); setFiltro(""); setDataDe(""); setDataAte(""); setMaqFiltro(""); }}>
              Limpar filtros
            </Button>
          )}

          <Button size="sm" variant="outline" onClick={() => exportarCsvPcm(filtradas)}>
            ⬇ Baixar CSV ({filtradas.length})
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportarPdfPcm(filtradas, [
            maqLista.length ? `Máquinas: ${maqFiltro}` : "Todas as máquinas",
            statusFiltro !== "ALL" ? `Status: ${statusFiltro.split("|").map(statusLabel).join(", ")}` : "Todos os status",
            dataDe || dataAte ? `Período: ${dataDe ? fmtDataBr(dataDe + "T12:00:00") : "…"} a ${dataAte ? fmtDataBr(dataAte + "T12:00:00") : "…"}` : "",
          ].filter(Boolean).join(" · "))}>
            🖨 Baixar PDF ({filtradas.length})
          </Button>
        </div>

        {selAcomp.length > 0 && (() => {
          const alvos = filtradas.filter((s) => selAcomp.includes(s.id));
          return (
            <div className="sticky top-0 z-10 space-y-2 rounded border-2 border-primary bg-primary/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">✏️ Atualizar em lote — {alvos.length} linha(s) selecionada(s)</span>
                <Button size="sm" variant="ghost" onClick={() => { setSelAcomp([]); setLoteEquip(null); }}>Limpar seleção</Button>
              </div>
              <SelecionarEquipamento value={loteEquip} onChange={setLoteEquip} />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div><Label htmlFor="os-lote" className="text-xs">OS</Label><Input id="os-lote" className="uppercase" value={loteForm.os_numero} onChange={(e) => setLoteForm((f) => ({ ...f, os_numero: e.target.value.toUpperCase() }))} /></div>
                <div><Label className="text-xs">Nº RC</Label><Input className="uppercase" value={loteForm.rc_numero} onChange={(e) => setLoteForm((f) => ({ ...f, rc_numero: e.target.value.toUpperCase() }))} /></div>
                <div><Label className="text-xs">Nº Pedido</Label><Input className="uppercase" value={loteForm.numero_pedido_compra} onChange={(e) => setLoteForm((f) => ({ ...f, numero_pedido_compra: e.target.value.toUpperCase() }))} /></div>
                <div><Label className="text-xs">Valor do pedido (R$)</Label><Input inputMode="numeric" placeholder="0,00" value={loteForm.valor_total} onChange={(e) => setLoteForm((f) => ({ ...f, valor_total: mascaraBRL(e.target.value) }))} /></div>
                <div><Label className="text-xs">Fornecedor</Label><Input className="uppercase" value={loteForm.fornecedor} onChange={(e) => setLoteForm((f) => ({ ...f, fornecedor: e.target.value.toUpperCase() }))} /></div>
                <div>
                  <div className="flex items-center justify-between"><Label className="text-xs">Aprovador</Label><EditarAprovadoresBotao /></div>
                  <select value={loteForm.coordenador} onChange={(e) => setLoteForm((f) => ({ ...f, coordenador: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                    <option value="">— Manter —</option>
                    {aprovadores.map((a) => <option key={a.id ?? a.coordenador} value={a.coordenador}>{a.coordenador} → {a.gerente}</option>)}
                  </select>
                </div>
                <div><Label className="text-xs">Prazo de entrega</Label><Input type="date" value={loteForm.prazo_entrega} onChange={(e) => setLoteForm((f) => ({ ...f, prazo_entrega: e.target.value }))} /></div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <select value={loteForm.status} onChange={(e) => setLoteForm((f) => ({ ...f, status: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring">
                    <option value="">— Manter —</option>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Campos em branco não são alterados. Nº do pedido, fornecedor e prazo também são gravados no pedido de compra vinculado.</p>
              <Button size="sm" disabled={upd.isPending} onClick={() => aplicarLote(alvos)}>💾 Aplicar em {alvos.length} linha(s)</Button>
            </div>
          );
        })()}

        <div className="overflow-x-auto rounded border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2">
                  <Checkbox
                    checked={visiveis.length > 0 && visiveis.every((s) => selAcomp.includes(s.id))}
                    onCheckedChange={(v) => setSelAcomp(v ? Array.from(new Set([...selAcomp, ...visiveis.map((s) => s.id)])) : [])}
                    aria-label="Selecionar todas"
                  />
                </th>
                <th className="p-2">OS / Equip</th><th className="p-2">Peça</th><th className="p-2">Solicitante</th>
                <th className="p-2">RC</th><th className="p-2">Data RC</th><th className="p-2">PED</th><th className="p-2">Valor</th><th className="p-2">Fornecedor</th>
                <th className="p-2">Aprovador</th>
                <th className="p-2">Prazo</th><th className="p-2">Status</th><th className="p-2">Alerta</th>
                <th className="p-2">Fase / Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && <tr><td colSpan={14} className="p-4 text-center text-muted-foreground">Nenhuma solicitação nos filtros atuais.</td></tr>}



              {visiveis.map((s) => {
                const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null } }).equipamento;
                const sol = (s as { solicitante?: { nome?: string } }).solicitante?.nome ?? "—";
                const prazo = s.prazo_entrega ? new Date(s.prazo_entrega) : null;
                const chegou = ["RECEBIDA_ALMOX", "ENTREGUE_MECANICO", "FINALIZADA"].includes(s.status);
                const atrasada = prazo && prazo < hoje && !chegou;
                const eHoje = prazo && prazo.getTime() === hoje.getTime() && !chegou;
                const marcada = selAcomp.includes(s.id);
                const chavePed = s.pedido_compra_id ?? (s.numero_pedido_compra?.trim() || null);
                const selecionarPedido = () => {
                  if (!chavePed) return;
                  const irmas = filtradas.filter((x) => (x.pedido_compra_id ?? (x.numero_pedido_compra?.trim() || null)) === chavePed).map((x) => x.id);
                  setSelAcomp((c) => Array.from(new Set([...c, ...irmas])));
                };
                return (
                  <tr key={s.id} className={`border-t align-top ${marcada ? "bg-primary/5" : ""}`}>
                    <td className="p-2">
                      <Checkbox checked={marcada} aria-label="Selecionar linha"
                        onCheckedChange={(v) => setSelAcomp((c) => (v ? [...c, s.id] : c.filter((x) => x !== s.id)))} />
                    </td>
                    <td className="p-2"><div className="font-medium">{s.os_numero}</div><div className="text-muted-foreground">{eq?.prefixo_interno}{eq?.codigo_armac ? ` · ${eq.codigo_armac}` : ""}</div></td>

                    <td className="p-2"><div>{s.descricao}</div><DesvioBadge solicitacao={s} className="my-1" />{(s as { em_cadastro?: boolean }).em_cadastro && <Badge variant="destructive" className="my-1 animate-pulse">🔴 EM CADASTRO</Badge>}<div className="text-muted-foreground">cod. {s.codigo_peca ?? "—"} · Qtd {s.quantidade}</div>{s.observacoes_gerais && <div className="mt-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800">📝 {s.observacoes_gerais}</div>}{s.foto_peca_path && <div className="mt-1"><FotoPecaLazy path={s.foto_peca_path} /></div>}</td>
                    <td className="p-2">{sol}</td>
                    <td className="p-2">{s.rc_numero ?? ((s as { reserva_numero?: string | null }).reserva_numero ? `RES ${(s as { reserva_numero?: string | null }).reserva_numero}` : "—")}</td>
                    <td className="p-2 whitespace-nowrap">{dataRcDe(s) ?? "—"}</td>
                    <td className="p-2">
                      <div>{s.numero_pedido_compra ?? "—"}</div>
                      {chavePed && (
                        <button type="button" onClick={selecionarPedido} className="mt-1 text-[10px] text-primary underline">
                          selecionar pedido inteiro
                        </button>
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap font-medium">
                      {(() => {
                        const v = valorDe(s);
                        if (v === null) return <span className="text-muted-foreground">—</span>;
                        const pid = (s as { pedido_compra_id?: string | null }).pedido_compra_id;
                        const n = pid ? (itensPorPedido.get(pid) ?? 1) : 1;
                        return (
                          <div>
                            <div>R$ {v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                            {n > 1 && <div className="text-[10px] font-normal text-muted-foreground">total do pedido · {n} peças</div>}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-2">{s.fornecedor ?? "—"}</td>
                    <td className="p-2">
                      {(() => {
                        const ped = (s as { pedido?: { coordenador?: string | null; gerente?: string | null } }).pedido;
                        if (!ped?.coordenador) return <span className="text-muted-foreground">—</span>;
                        return <div><div>{ped.coordenador}</div><div className="text-muted-foreground">{ped.gerente}</div></div>;
                      })()}
                    </td>
                    <td className="p-2">{prazo ? prazo.toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="p-2"><Badge variant="outline">{statusLabelDe(s)}</Badge></td>
                    <td className="p-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {atrasada && <Badge variant="destructive" className="animate-pulse">🚨 Verificar!</Badge>}
                        {eHoje && <Badge className="animate-pulse bg-amber-500 text-white hover:bg-amber-500">Hoje</Badge>}
                        {["PEDIDO_COLOCADO", "EM_TRANSITO"].includes(s.status) && (
                          <Button size="sm" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700" onClick={() => setAviso(s)}>✓ Chegou</Button>
                        )}
                        {s.status === "RECEBIDA_ALMOX" && <Badge className="bg-green-600">Aguardando retirada</Badge>}
                        <Button size="sm" variant="ghost" className="h-7 px-2" title="Editar RC" onClick={() => abrirEdicao(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-700 hover:bg-red-50" title="Cancelar RC (remove do controle)" onClick={() => { setCancelModal({ itens: [s], titulo: `${s.descricao} — OS ${s.os_numero}` }); setMotivoCancel(""); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                    <td className="p-2">
                      {(() => {
                        const f = faseDe(s);
                        if (!f) return <span className="text-muted-foreground">—</span>;
                        const dt = dataFaseDe(s, f);
                        const dias = diasDesde(dt);
                        const irmas = irmasDoPedido(s);
                        return (
                          <div className="space-y-1">
                            <div className="text-[11px] font-medium">{FASE_LABEL[f]}</div>
                            {f === "RC_SEM_PEDIDO" && (
                              <>
                                <div className="text-[10px] text-muted-foreground">RC criada em {fmtData(dt)}</div>
                                {dias !== null && dias >= 2 && (
                                  <Badge variant="destructive" className="animate-pulse">🚨 {dias}d sem pedido — conferir</Badge>
                                )}
                                {precisaRefazer(s) && (
                                  <Badge variant="destructive" className="animate-pulse">🔁 Rejeitado — cobrar refazimento (PED {s.numero_pedido_compra})</Badge>
                                )}
                              </>
                            )}
                            {f === "EM_APROVACAO" && (
                              <>
                                <div className="text-[10px] text-muted-foreground">
                                  Com {nivelAprovacaoLabel(s.status)}{nomeAprovadorAtual(s) ? ` (${nomeAprovadorAtual(s)})` : ""} desde {fmtData(dt)}
                                </div>
                                {dias !== null && dias >= 1 && <Badge variant="destructive" className="animate-pulse">⏰ {dias}d aguardando aprovação</Badge>}
                                <div className="flex gap-1">
                                  <Button size="sm" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700" disabled={upd.isPending} onClick={() => avancarAprovacao(s)}>✓ Aprovado</Button>
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-700" onClick={() => { setRejModal(irmas.filter((x) => x.status.startsWith("PEDIDO_EM_APROVACAO"))); setRejMotivo(""); }}>✗ Rejeitado</Button>
                                </div>
                              </>
                            )}
                            {f === "APROVADOS" && (
                              <>
                                <div className="text-[10px] text-muted-foreground">Envio solicitado em {fmtData(dt)}</div>
                                {dias !== null && dias >= 1 && <Badge variant="destructive" className="animate-pulse">📮 {dias}d — conferir se foi enviado</Badge>}
                                <Button size="sm" className="h-7 px-2 text-xs" disabled={upd.isPending} onClick={() => { setEnvioModal(irmas.filter((x) => x.status === "PEDIDO_APROVADO_GESTAO")); setEnvioPrazo(s.prazo_entrega ?? ""); }}>🚚 Marcar enviado</Button>
                              </>
                            )}
                            {f === "ENVIADOS" && (
                              <>
                                <div className="text-[10px] text-muted-foreground">Enviado em {fmtData(dt)} · entrega {s.prazo_entrega ? fmtData(s.prazo_entrega) : "—"}</div>
                                {!s.prazo_entrega && <Badge variant="destructive" className="animate-pulse">⚠️ Sem prazo — informar prazo de entrega</Badge>}
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtradas.length > visiveis.length && (
            <div className="flex items-center justify-center gap-3 border-t p-3 text-xs text-muted-foreground">
              <span>Mostrando {visiveis.length} de {filtradas.length}</span>
              <Button size="sm" variant="outline" onClick={() => setLimite((l) => l + 200)}>Mostrar mais 200</Button>
            </div>
          )}
        </div>
      </section>
      )}




      <Dialog open={!!envioModal} onOpenChange={(v) => !v && setEnvioModal(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Marcar pedido como enviado</DialogTitle>
            <DialogDescription>Informe o prazo de entrega do pedido.</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{envioModal?.length ?? 0} peça(s) do pedido {envioModal?.[0]?.numero_pedido_compra ?? ""}</p>
          <Label>Prazo de entrega</Label>
          <Input type="date" value={envioPrazo} onChange={(e) => setEnvioPrazo(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEnvioModal(null)}>Voltar</Button>
            <Button disabled={upd.isPending} onClick={confirmarEnvio}>Confirmar envio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejModal} onOpenChange={(v) => !v && setRejModal(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar rejeição da aprovação</DialogTitle>
            <DialogDescription>O pedido volta para “RC sem pedido” com alerta para refazer o pedido.</DialogDescription>
          </DialogHeader>
          <Label>Motivo da rejeição</Label>
          <Textarea value={rejMotivo} onChange={(e) => setRejMotivo(e.target.value.toUpperCase())} className="uppercase" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejModal(null)}>Voltar</Button>
            <Button variant="destructive" disabled={upd.isPending} onClick={confirmarRejeicaoAprovador}>Registrar rejeição</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelModal} onOpenChange={(v) => !v && setCancelModal(null)}>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar RC</DialogTitle>
            <DialogDescription className="sr-only">Informe o motivo do cancelamento da RC.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{cancelModal?.titulo}</p>
          <p className="text-xs text-muted-foreground">O item sai do controle do PCM (fica registrado como cancelado no histórico).</p>
          <Label>Motivo (ex.: outro setor já comprou, duplicidade, OS cancelada)</Label>
          <Textarea value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value.toUpperCase())} className="uppercase" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelModal(null)}>Voltar</Button>
            <Button variant="destructive" disabled={upd.isPending} onClick={confirmarCancelamento}>Cancelar RC</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendModal} onOpenChange={(v) => !v && setPendModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver ao solicitante</DialogTitle>
            <DialogDescription className="sr-only">Informe o motivo da devolução da peça ao solicitante.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Peça: <b>{pendModal?.descricao}</b> — OS {pendModal?.os_numero}</p>
          <Label>Motivo (ex.: peça não localizada no manual, código errado, pendente cadastro SAP)</Label>
          <Textarea value={motivoPend} onChange={(e) => setMotivoPend(e.target.value.toUpperCase())} className="uppercase" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendModal(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => {
              if (!pendModal || !motivoPend.trim()) return toast.error("Informe o motivo");
              upd.mutate({ id: pendModal.id, patch: {
                status: "PENDENCIA_SOLICITANTE",
                pcm_motivo_pendencia: motivoPend.trim(),
                pcm_at: new Date().toISOString(),
              }, msg: "Devolvida ao solicitante" });
              setPendModal(null);
            }}>Devolver</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPeca} onOpenChange={(v) => !v && setEditPeca(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corrigir peça solicitada</DialogTitle>
            <DialogDescription>Ajuste a máquina, o código, a descrição ou a quantidade sem devolver ao mecânico.</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">OS {editPeca?.os_numero} · {(editPeca as { equipamento?: { prefixo_interno?: string } } | null)?.equipamento?.prefixo_interno ?? "—"} · Solicitante: {(editPeca as { solicitante?: { nome?: string } } | null)?.solicitante?.nome ?? "—"}</p>
          <div className="grid gap-3">
            <div>
              <Label>Máquina</Label>
              {pecaEquip ? (
                <div className="flex items-center justify-between rounded-md border border-blue-500 px-3 py-2 text-sm">
                  <span>Nova máquina: <b>{pecaEquip.nome}</b></span>
                  <Button size="sm" variant="ghost" onClick={() => setPecaEquip(null)}>Desfazer</Button>
                </div>
              ) : (
                <>
                  <Input value={buscaEqPeca} onChange={(e) => setBuscaEqPeca(e.target.value.toUpperCase())} placeholder="Para trocar a máquina, busque o prefixo ou cód. Armac" className="uppercase" />
                  {termoEqPeca.length >= 2 && (
                    <div className="mt-1 max-h-40 overflow-y-auto rounded-md border">
                      {buscandoEqPeca && <p className="p-2 text-xs text-muted-foreground">Buscando…</p>}
                      {!buscandoEqPeca && eqsPeca.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nenhuma máquina encontrada.</p>}
                      {eqsPeca.map((eq) => (
                        <button key={eq.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setPecaEquip({ id: eq.id, nome: [eq.prefixo_interno, eq.codigo_armac].filter(Boolean).join(" · ") }); setBuscaEqPeca(""); }}>
                          <b>{eq.prefixo_interno}</b>{eq.codigo_armac ? ` · ${eq.codigo_armac}` : ""}
                          {eq.descricao ? <span className="block text-xs text-muted-foreground">{eq.descricao}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <Label>Código da peça</Label>
              <Input value={pecaForm.codigo_peca} onChange={(e) => setPecaForm((f) => ({ ...f, codigo_peca: e.target.value.toUpperCase() }))} className="uppercase" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={pecaForm.descricao} onChange={(e) => setPecaForm((f) => ({ ...f, descricao: e.target.value.toUpperCase() }))} className="uppercase" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantidade</Label>
                <Input type="number" min={1} step="any" value={pecaForm.quantidade} onChange={(e) => setPecaForm((f) => ({ ...f, quantidade: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Unidade</Label>
                <Input value={pecaForm.unidade} onChange={(e) => setPecaForm((f) => ({ ...f, unidade: e.target.value.toUpperCase() }))} className="uppercase" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditPeca(null)}>Cancelar</Button>
            <Button disabled={upd.isPending} onClick={salvarEditPeca}>Salvar correção</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!aviso} onOpenChange={(v) => !v && setAviso(null)}>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar recebida no almoxarifado</DialogTitle>
            <DialogDescription className="sr-only">Confirme o recebimento da peça no almoxarifado para avisar o solicitante.</DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Peça: <b>{aviso?.descricao}</b><br />
            Máquina: <b>{aviso?.equipamento?.prefixo_interno}</b> · OS <b>{aviso?.os_numero}</b><br />
            Solicitante: <b>{aviso?.solicitante?.nome}</b>
          </p>
          <p className="text-xs text-muted-foreground">O solicitante receberá o aviso para vir retirar a peça no almoxarifado.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAviso(null)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => {
              if (!aviso) return;
              upd.mutate({
                id: aviso.id,
                patch: { status: "RECEBIDA_ALMOX", data_recebimento_almox: new Date().toISOString() },
                msg: "Peça marcada como recebida — solicitante avisado",
              });
              setAviso(null);
            }}>Confirmar chegada</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRc} onOpenChange={(v) => !v && setEditRc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar RC</DialogTitle>
            <DialogDescription className="sr-only">Ajuste os dados da solicitação de compra.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <SelecionarEquipamento
              value={pecaEquip}
              onChange={setPecaEquip}
              atual={editRc?.equipamento?.prefixo_interno ?? "—"}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="os-editar-rc" className="text-xs">OS</Label>
                <Input id="os-editar-rc" value={editForm.os_numero} onChange={(e) => setEditForm((f) => ({ ...f, os_numero: e.target.value.toUpperCase() }))} className="uppercase" />
              </div>
              <div>
                <Label className="text-xs">Nº RC</Label>
                <Input value={editForm.rc_numero} onChange={(e) => setEditForm((f) => ({ ...f, rc_numero: e.target.value.toUpperCase() }))} className="uppercase" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Nº Pedido de Compra</Label>
                <Input value={editForm.numero_pedido_compra} onChange={(e) => setEditForm((f) => ({ ...f, numero_pedido_compra: e.target.value.toUpperCase() }))} className="uppercase" placeholder="Ex.: 12345" />
                {editRc?.pedido_compra_id && <p className="text-[10px] text-muted-foreground mt-1">Atualiza também o pedido vinculado a esta RC.</p>}
              </div>
              <div>
                <Label className="text-xs">Valor total do pedido (R$)</Label>
                <Input inputMode="numeric" placeholder="0,00" value={editForm.valor_total} onChange={(e) => setEditForm((f) => ({ ...f, valor_total: mascaraBRL(e.target.value) }))} />
                <p className="text-[10px] text-muted-foreground mt-1">Define a alçada de aprovação.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Fornecedor</Label>
                <Input value={editForm.fornecedor} onChange={(e) => setEditForm((f) => ({ ...f, fornecedor: e.target.value.toUpperCase() }))} className="uppercase" placeholder="Ex.: VOX PECAS" />
              </div>
              <div>
                <Label className="text-xs">Prazo de entrega</Label>
                <Input type="date" value={editForm.prazo_entrega} onChange={(e) => setEditForm((f) => ({ ...f, prazo_entrega: e.target.value }))} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Aprovador imediato (Coordenador) — opcional</Label>
                <EditarAprovadoresBotao />
              </div>
              <select
                value={editForm.coordenador}
                onChange={(e) => setEditForm((f) => ({ ...f, coordenador: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— Não informado —</option>
                {aprovadores.map((a) => (
                  <option key={a.id ?? a.coordenador} value={a.coordenador}>{a.coordenador}</option>
                ))}
              </select>
              {(() => {
                const apr = acharAprovador(aprovadores, editForm.coordenador);
                return apr ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">Gerente: <b>{apr.gerente}</b> · Diretor: <b>{apr.diretor}</b></p>
                ) : null;
              })()}
            </div>


            <div>
              <Label className="text-xs">Descrição da peça</Label>
              <Textarea rows={2} value={editForm.descricao} onChange={(e) => setEditForm((f) => ({ ...f, descricao: e.target.value.toUpperCase() }))} className="uppercase" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Código</Label>
                <Input value={editForm.codigo_peca} onChange={(e) => setEditForm((f) => ({ ...f, codigo_peca: e.target.value.toUpperCase() }))} className="uppercase" />
              </div>
              <div>
                <Label className="text-xs">Qtd</Label>
                <Input type="number" min={1} value={editForm.quantidade} onChange={(e) => setEditForm((f) => ({ ...f, quantidade: Number(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs">Un.</Label>
                <Input value={editForm.unidade} onChange={(e) => setEditForm((f) => ({ ...f, unidade: e.target.value.toUpperCase() }))} className="uppercase" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} value={editForm.observacoes_gerais} onChange={(e) => setEditForm((f) => ({ ...f, observacoes_gerais: e.target.value.toUpperCase() }))} className="uppercase" />
            </div>
            <div>
              <Label className="text-xs">Status da RC</Label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring"
              >
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              {editRc && editForm.status !== editRc.status && (
                <p className="mt-1 text-[10px] text-amber-600">⚠ O status será alterado manualmente de "{statusLabel(editRc.status)}" para "{STATUS_LABEL[editForm.status as keyof typeof STATUS_LABEL] ?? editForm.status}".</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editRc && (editRc.numero_pedido_compra || editRc.pedido_compra_id) ? (
              <Button variant="destructive" onClick={() => editRc && limparDadosPedido(editRc)} disabled={upd.isPending}>
                🧹 Limpar dados do pedido
              </Button>
            ) : <span />}
            <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEditRc(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={upd.isPending}>Salvar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Aprovações (Coord/Gerente/Diretoria via Admin) — POR PEDIDO ----------
function AprovacoesTab({ items, roles }: { items: Solic[]; onChange: () => void; roles: Role[] }) {
  const upd = useUpdate();
  const podeCoord = roles.includes("coordenador") || roles.includes("admin");
  const podeGerente = roles.includes("gerente") || roles.includes("admin");
  const podeDir = roles.includes("admin");

  const [rejeicao, setRejeicao] = useState<{ ids: string[]; label: string; escopo: "pedido" | "item" } | null>(null);
  const [motivoRej, setMotivoRej] = useState("");
  const [busca, setBusca] = useState("");
  const buscaDif = useDeferredValue(busca);

  const pendentesTodos = items.filter((s) =>
    (podeCoord && s.status === "PEDIDO_EM_APROVACAO_COORD") ||
    (podeGerente && s.status === "PEDIDO_EM_APROVACAO_GERENTE") ||
    (podeDir && s.status === "PEDIDO_EM_APROVACAO_DIRETORIA"),
  );

  const termo = buscaDif.trim().toUpperCase();
  const pendentes = !termo
    ? pendentesTodos
    : pendentesTodos.filter((s) => {
        const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null } }).equipamento;
        const alvo = [
          s.numero_pedido_compra, s.rc_numero, s.os_numero, s.descricao, s.codigo_peca,
          (s as { reserva_numero?: string | null }).reserva_numero,
          pedidoDe(s)?.fornecedor ?? s.fornecedor,
          eq?.prefixo_interno, eq?.codigo_armac,
        ].filter(Boolean).join(" ").toUpperCase();
        return alvo.includes(termo);
      });


  // Agrupa por Nº do Pedido (ou por Reserva, quando for material do almoxarifado)
  const grupos = new Map<string, Solic[]>();
  for (const s of pendentes) {
    const reserva = (s as { reserva_numero?: string | null }).reserva_numero;
    const key = reserva ? `__RESERVA__${reserva}` : (s.pedido_compra_id || s.numero_pedido_compra?.trim() || `__SEM_PED__${s.id}`);
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(s);
  }

  const blocos = Array.from(grupos.entries()).map(([key, itens]) => ({ key, itens }));

  const devolverParaComprador = async (ids: string[], label: string) => {
    if (!ids.length) return;
    const motivo = prompt(`Devolver ${label} para o Comprador. Descreva o motivo (ex.: valor/prazo incorretos):`);
    if (motivo === null) return;
    if (!motivo.trim()) return toast.error("Informe o motivo da devolução");
    for (const id of ids) {
      await upd.mutateAsync({
        id,
        patch: {
          status: "EM_TRATAMENTO_PCM",
          motivo_reprovacao_gestao: `DEVOLVIDA PELO APROVADOR: ${motivo.trim().toUpperCase()}`,
          aprovador_gestao_id: null,
          aprovador_gestao_at: null,
        },
      });
    }
    toast.success("Devolvida(s) para o Comprador");
  };

  const confirmarReprovacao = async () => {
    if (!rejeicao) return;
    if (!motivoRej.trim()) return toast.error("Informe o motivo");
    for (const id of rejeicao.ids) {
      await upd.mutateAsync({
        id,
        patch: { status: "PEDIDO_REPROVADO_GESTAO", motivo_reprovacao_gestao: motivoRej.trim().toUpperCase() },
      });
    }
    toast.success(rejeicao.escopo === "pedido"
      ? "Pedido reprovado"
      : `${rejeicao.ids.length} peça(s) reprovada(s) — as demais seguem para aprovação`);
    setRejeicao(null); setMotivoRej("");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nº do pedido, RC, OS, peça, fornecedor, máquina..."
          className="max-w-md"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {termo && (
          <Button size="sm" variant="ghost" onClick={() => setBusca("")}>Limpar</Button>
        )}
      </div>
      <h3 className="text-sm font-semibold">
        Aguardando aprovação — {blocos.length} pedido(s) ({pendentes.length} peça(s))
        {termo ? ` · filtrando "${busca}" de ${pendentesTodos.length} peça(s)` : ""}
      </h3>
      {blocos.length === 0 && <p className="text-sm text-muted-foreground">{termo ? "Nenhum pedido encontrado para esta busca." : "Nada pendente."}</p>}
      {blocos.map(({ key, itens }) => {
        const primeiro = itens[0];
        const reservaNum = (primeiro as { reserva_numero?: string | null }).reserva_numero ?? null;
        const pedido = pedidoDe(primeiro);
        const valorTotal = Number(pedido?.valor_total ?? 0);
        const status = primeiro.status;
        const proximo: Database["public"]["Enums"]["solicitacao_status"] = reservaNum
          ? "RECEBIDA_ALMOX"
          : status === "PEDIDO_EM_APROVACAO_COORD"
            ? (valorTotal > 5000 ? "PEDIDO_EM_APROVACAO_GERENTE" : "PEDIDO_APROVADO_GESTAO")
            : status === "PEDIDO_EM_APROVACAO_GERENTE"
              ? (valorTotal > 20000 ? "PEDIDO_EM_APROVACAO_DIRETORIA" : "PEDIDO_APROVADO_GESTAO")
              : "PEDIDO_APROVADO_GESTAO";
        const nivelLabel = status === "PEDIDO_EM_APROVACAO_COORD" ? "Coordenador"
          : status === "PEDIDO_EM_APROVACAO_GERENTE" ? "Gerente" : "Diretoria";
        const proximoLabel = reservaNum
          ? `Aprovado → material liberado no almoxarifado com a reserva ${reservaNum} (sem compra)`
          : proximo === "PEDIDO_APROVADO_GESTAO"
            ? "Aprovado → segue para o Comprador colocar o Pedido de Compra"
            : proximo === "PEDIDO_EM_APROVACAO_GERENTE"
              ? "Aprovado por você → segue para o Gerente"
              : "Aprovado por você → segue para a Diretoria";

        const aprovarTodas = async () => {
          const agora = new Date().toISOString();
          for (const s of itens) {
            await upd.mutateAsync({
              id: s.id,
              patch: reservaNum
                ? {
                    status: "RECEBIDA_ALMOX",
                    aprovador_gestao_at: agora,
                    data_recebimento_almox: agora,
                    observacao_recebimento: `MATERIAL LIBERADO NO ALMOXARIFADO — RESERVA ${reservaNum}`,
                  }
                : {
                    status: proximo,
                    ...(proximo === "PEDIDO_APROVADO_GESTAO" ? {
                      aprovador_gestao_at: agora,
                      liberacao_diretoria: status === "PEDIDO_EM_APROVACAO_DIRETORIA",
                    } : {}),
                  },
            });
          }
          if (!reservaNum && proximo === "PEDIDO_APROVADO_GESTAO" && pedido?.id) {
            const dias = (pedido as unknown as { prazo_dias_entrega?: number | null }).prazo_dias_entrega;
            const jaTemData = !!pedido.prazo_entrega;
            if (!jaTemData && dias != null && Number.isFinite(Number(dias))) {
              const d = new Date();
              d.setDate(d.getDate() + Number(dias) + 1);
              await supabase.from("pedidos_compra").update({ prazo_entrega: d.toISOString().slice(0, 10) }).eq("id", pedido.id);
            }
          }
          toast.success(reservaNum
            ? `Reserva ${reservaNum} aprovada — solicitante avisado para retirar no almoxarifado`
            : proximo === "PEDIDO_APROVADO_GESTAO"
              ? `Pedido ${primeiro.numero_pedido_compra ?? ""} aprovado — liberado ao Comprador`
              : `Pedido ${primeiro.numero_pedido_compra ?? ""} aprovado — segue para ${proximo === "PEDIDO_EM_APROVACAO_GERENTE" ? "Gerente" : "Diretoria"}`);
        };


        const eq = (primeiro as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null } }).equipamento;

        return (
          <Card key={key}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    {reservaNum
                      ? `📦 Reserva ${reservaNum} — Almoxarifado (sem compra)`
                      : (pedido?.numero_pedido_compra || primeiro.numero_pedido_compra ? `Pedido #${pedido?.numero_pedido_compra ?? primeiro.numero_pedido_compra}` : "Pedido ainda sem número")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {itens.length} peça(s) · {reservaNum ? `Reserva ${reservaNum}` : `RC ${primeiro.rc_numero ?? "—"}`} · OS {primeiro.os_numero}
                    {eq?.prefixo_interno ? ` · ${eq.prefixo_interno}${eq.codigo_armac ? " · cod. " + eq.codigo_armac : ""}` : ""}
                  </CardDescription>

                </div>
                <Badge variant="outline">{statusLabelDe({ status, numero_pedido_compra: primeiro.numero_pedido_compra })}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4">
                <div><span className="text-muted-foreground">Fornecedor:</span> <b>{pedido?.fornecedor ?? primeiro.fornecedor ?? "—"}</b></div>
                <div><span className="text-muted-foreground">Frete:</span> <b>{pedido?.tipo_frete ?? primeiro.tipo_frete ?? "—"}</b></div>
                <div><span className="text-muted-foreground">Transportadora:</span> <b>{pedido?.transportadora ?? primeiro.transportadora ?? "—"}</b></div>
                <div><span className="text-muted-foreground">Prazo:</span> <b>{(pedido?.prazo_entrega ?? primeiro.prazo_entrega) ? new Date((pedido?.prazo_entrega ?? primeiro.prazo_entrega)!).toLocaleDateString("pt-BR") : "—"}</b></div>
                <div className="col-span-2 md:col-span-4">
                  <span className="text-muted-foreground">Valor total do pedido:</span>{" "}
                  <b className="text-base text-foreground">R$ {valorTotal.toFixed(2)}</b>
                </div>
              </div>

              <div className="rounded border">
                <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold">Peças do pedido</div>
                <ul className="divide-y">
                  {itens.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">{s.descricao}</div>
                        <DesvioBadge solicitacao={s} />
                        <div className="text-[11px] text-muted-foreground">
                          {s.codigo_peca ? `cod. ${s.codigo_peca} · ` : ""}Qtd {s.quantidade} {s.unidade}
                          {s.duplicidade_detectada ? " · ⚠ DUPLICIDADE" : ""}
                        </div>
                        {s.foto_peca_path && <div className="mt-1"><FotoPecaLazy path={s.foto_peca_path} /></div>}
                      </div>
                      {itens.length > 1 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => { setMotivoRej(""); setRejeicao({ ids: [s.id], label: s.descricao, escopo: "item" }); }}
                        >
                          ✕ Reprovar item
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-muted-foreground">
                Nível atual: <b className="text-foreground">{nivelLabel}</b>
                {aprovadorAtual(status, pedido) && <> · Aprovador: <b className="text-foreground">{aprovadorAtual(status, pedido)!.nome}</b></>}
                {" "}· {proximoLabel}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={aprovarTodas}>✓ Aprovar pedido</Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => { setMotivoRej(""); setRejeicao({ ids: itens.map((i) => i.id), label: `pedido inteiro (${itens.length} peças)`, escopo: "pedido" }); }}
                >
                  ✕ Reprovar pedido
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-400 text-amber-700 hover:bg-amber-50"
                  disabled={upd.isPending}
                  onClick={() => devolverParaComprador(itens.map((i) => i.id), `pedido (${itens.length} peça(s))`)}
                >
                  ↩ Devolver p/ Comprador
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!rejeicao} onOpenChange={(v) => { if (!v) { setRejeicao(null); setMotivoRej(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar {rejeicao?.escopo === "pedido" ? "pedido" : "peça"}</DialogTitle>
            <DialogDescription>
              {rejeicao?.escopo === "pedido"
                ? "Todas as peças deste pedido serão reprovadas e ficarão no histórico."
                : "Somente esta peça será reprovada. As demais seguirão o fluxo normal de aprovação."}
              {" "}Alvo: <b>{rejeicao?.label}</b>
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            placeholder="Motivo da reprovação (obrigatório)"
            value={motivoRej}
            onChange={(e) => setMotivoRej(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejeicao(null); setMotivoRej(""); }}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarReprovacao}>Confirmar reprovação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Comprador ----------
function exportarCsvComprador(rows: Solic[], aba: "TRATAR" | "EM_APROVACAO" | "APROVADOS" | "ENVIADOS") {
  if (!rows.length) return;
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "RC", "Máquina", "Modelo", "Nº série", "OS", "Solicitante", "Código da peça", "Descrição", "Qtd", "Unid.",
    "Status", "Nº Pedido", "Valor do pedido", "Fornecedor", "Frete", "Transportadora", "Prazo de entrega", "Data da RC",
  ];
  const linhas = rows.map((s) => {
    const eq = s.equipamento as { prefixo_interno?: string; codigo_armac?: string | null; modelo?: string | null; numero_serie?: string | null; descricao?: string | null } | undefined;
    const maq = [eq?.prefixo_interno, eq?.codigo_armac].filter(Boolean).join(" · ") || (eq?.descricao ?? "—");
    const p = pedidoDe(s);
    const valor = p?.valor_total ?? s.valor_total ?? null;
    const prazo = p?.prazo_entrega ?? s.prazo_entrega ?? null;
    return [
      s.rc_numero ?? "", maq, eq?.modelo ?? "", eq?.numero_serie ?? "", s.os_numero, s.solicitante?.nome ?? "",
      s.codigo_peca ?? "", s.descricao, s.quantidade, s.unidade ?? "UN",
      STATUS_LABEL[s.status] ?? s.status,
      p?.numero_pedido_compra ?? s.numero_pedido_compra ?? "",
      valor === null || valor === undefined ? "" : Number(valor).toFixed(2).replace(".", ","),
      p?.fornecedor ?? s.fornecedor ?? "",
      p?.tipo_frete ?? s.tipo_frete ?? "",
      p?.transportadora ?? s.transportadora ?? "",
      prazo ? new Date(prazo + "T00:00:00").toLocaleDateString("pt-BR") : "",
      dataRcDe(s) ?? "",
    ];
  });
  const csv = "\uFEFF" + [header, ...linhas].map((r) => r.map(escape).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const nome = aba === "TRATAR" ? "a-tratar" : aba === "EM_APROVACAO" ? "em-aprovacao" : aba === "APROVADOS" ? "aprovados" : "enviados";
  a.download = `comprador-${nome}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function CompradorTab({ items }: { items: Solic[]; onChange: () => void }) {

  const qc = useQueryClient();
  const alimentarPedido = useServerFn(alimentarPedidoCompra);
  const atualizarSolic = useServerFn(atualizarSolicitacao);
  const [devolvendo, setDevolvendo] = useState(false);

  const devolverParaAprovacao = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm(`Devolver ${ids.length} peça(s) para a fila de aprovação (Coordenador)?`)) return;
    setDevolvendo(true);
    try {
      for (const id of ids) {
        await atualizarSolic({
          data: {
            id,
            patch: {
              status: "PEDIDO_EM_APROVACAO_COORD",
              aprovador_gestao_id: null,
              aprovador_gestao_at: null,
              liberacao_diretoria: false,
              liberacao_diretoria_at: null,
            },
          },
        });
      }
      await qc.invalidateQueries({ queryKey: ["solicitacoes"] });
      toast.success("Pedido devolvido para aprovação");
      setSelecionados({});
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDevolvendo(false);
    }
  };

  const devolverParaPcm = async (ids: string[]) => {
    if (!ids.length) return;
    const motivo = prompt(`Devolver ${ids.length} peça(s) para o PCM. Descreva o motivo (ex.: RC alimentada errada):`);
    if (motivo === null) return;
    if (!motivo.trim()) { toast.error("Informe o motivo da devolução"); return; }
    setDevolvendo(true);
    try {
      for (const id of ids) {
        await atualizarSolic({
          data: {
            id,
            patch: {
              status: "APROVADA_SUPERVISOR",

              pcm_motivo_pendencia: `DEVOLVIDA PELO COMPRADOR: ${motivo.trim().toUpperCase()}`,
              numero_pedido_compra: null,
              valor_total: null,
              fornecedor: null,
              tipo_frete: null,
              transportadora: null,
              codigo_rastreio: null,
              link_rastreio: null,
              prazo_entrega: null,
              comprador_id: null,
              comprador_at: null,
              aprovador_gestao_id: null,
              aprovador_gestao_at: null,
              liberacao_diretoria: false,
              liberacao_diretoria_at: null,
            },
          },
        });
      }
      await qc.invalidateQueries({ queryKey: ["solicitacoes"] });
      toast.success("Devolvida(s) para o PCM");
      setSelecionados({});
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDevolvendo(false);
    }
  };

  const [modalIds, setModalIds] = useState<string[] | null>(null);


  const [filtro, setFiltro] = useState("");
  const [subAba, setSubAba] = useState<"TRATAR" | "EM_APROVACAO" | "APROVADOS" | "ENVIADOS">("TRATAR");
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});

  // Campos do modal
  const [pc, setPc] = useState("");
  const [prazoModo, setPrazoModo] = useState<PrazoModo>("IMEDIATA");
  const [prazo, setPrazo] = useState(""); // usado apenas quando modo = CUSTOM (data específica)
  const [valor, setValor] = useState("");
  const [forn, setForn] = useState("");
  const [frete, setFrete] = useState<"LOCAL" | "TRANSPORTADORA">("LOCAL");
  const [trans, setTrans] = useState("");
  const [rastreio, setRastreio] = useState("");
  const [link, setLink] = useState("");
  const [coord, setCoord] = useState("");
  const { lista: aprovadores } = useAprovadores();


  // Fila do comprador: só o que ainda não foi enviado ao fornecedor.
  const fila = items.filter((s) => !(s as { reserva_numero?: string | null }).reserva_numero && [
    "EM_TRATAMENTO_PCM",
    "PEDIDO_EM_APROVACAO_COORD",
    "PEDIDO_EM_APROVACAO_GERENTE",
    "PEDIDO_EM_APROVACAO_DIRETORIA",
    "PEDIDO_APROVADO_GESTAO",
  ].includes(s.status));


  // Aprovado só conta como "pronto para enviar" quando já tem número de pedido.
  const temPedido = (s: Solic) => !!(s.numero_pedido_compra ?? "").toString().trim();
  const emAprovacaoStatus = ["PEDIDO_EM_APROVACAO_COORD", "PEDIDO_EM_APROVACAO_GERENTE", "PEDIDO_EM_APROVACAO_DIRETORIA"];
  const filaEmAprovacao = fila.filter((s) => emAprovacaoStatus.includes(s.status));
  const filaTratar = fila.filter((s) => !emAprovacaoStatus.includes(s.status) && (s.status !== "PEDIDO_APROVADO_GESTAO" || !temPedido(s)));
  const filaAprovados = fila.filter((s) => s.status === "PEDIDO_APROVADO_GESTAO" && temPedido(s));
  const base = subAba === "APROVADOS" ? filaAprovados : subAba === "EM_APROVACAO" ? filaEmAprovacao : filaTratar;

  const filtered = base.filter((s) => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return [s.numero_pedido_compra, s.rc_numero, s.equipamento?.prefixo_interno, s.equipamento?.codigo_armac, s.descricao, s.os_numero, s.fornecedor]
      .some((v) => (v ?? "").toString().toLowerCase().includes(q));
  });


  // Agrupa por RC + Equipamento (uma RC/máquina = um bloco); múltiplos fornecedores tratam com seleções separadas
  type G = { key: string; rc: string; equip: string; modelo: string | null; serie: string | null; solicitante: string; os: string; itens: Solic[] };
  const grupos = new Map<string, G>();
  for (const s of filtered) {
    const rc = s.rc_numero ?? "SEM RC";
    const eq = s.equipamento as { prefixo_interno?: string; codigo_armac?: string | null; modelo?: string | null; numero_serie?: string | null } | undefined;
    const equip = `${eq?.prefixo_interno ?? "?"}${eq?.codigo_armac ? " · cod. " + eq.codigo_armac : ""}`;
    const k = `${rc}::${s.equipamento_id}`;
    if (!grupos.has(k)) grupos.set(k, { key: k, rc, equip, modelo: eq?.modelo ?? null, serie: eq?.numero_serie ?? null, solicitante: s.solicitante?.nome ?? "—", os: s.os_numero, itens: [] });
    grupos.get(k)!.itens.push(s);
  }
  const blocos = Array.from(grupos.values());

  const abrirModal = (ids: string[]) => {
    if (!ids.length) return;
    const alvos = fila.filter((x) => ids.includes(x.id));
    const primeira = alvos[0];
    const pedido = pedidoDe(primeira);
    const totalExistente = Number(pedido?.valor_total ?? 0);
    setModalIds(ids);
    setPc(pedido?.numero_pedido_compra ?? primeira.numero_pedido_compra ?? "");
    const dias = (pedido as unknown as { prazo_dias_entrega?: number | null })?.prazo_dias_entrega ?? null;
    if (dias === 0) setPrazoModo("IMEDIATA");
    else if (dias === 3 || dias === 7 || dias === 15 || dias === 30) setPrazoModo(String(dias) as PrazoModo);
    else if (pedido?.prazo_entrega || primeira.prazo_entrega) setPrazoModo("CUSTOM");
    else setPrazoModo("IMEDIATA");
    setPrazo(pedido?.prazo_entrega ?? primeira.prazo_entrega ?? "");
    setValor(totalExistente > 0 ? formatarBRL(Math.round(totalExistente * 100)) : "");
    setForn(pedido?.fornecedor ?? primeira.fornecedor ?? "");
    setFrete((pedido?.tipo_frete as "LOCAL" | "TRANSPORTADORA") ?? (primeira.tipo_frete as "LOCAL" | "TRANSPORTADORA") ?? "LOCAL");
    setTrans(pedido?.transportadora ?? primeira.transportadora ?? "");
    setRastreio(pedido?.codigo_rastreio ?? primeira.codigo_rastreio ?? "");
    setLink(pedido?.link_rastreio ?? primeira.link_rastreio ?? "");
    setCoord((pedido as unknown as { coordenador?: string | null })?.coordenador ?? "");

  };

  const salvar = async () => {
    if (!modalIds || !modalIds.length) return;
    const alvos = fila.filter((s) => modalIds.includes(s.id));
    const v = valorBRLParaNumero(valor);
    if (!v || v <= 0) return toast.error("Informe o valor do pedido");
    if (!forn.trim()) return toast.error("Informe o fornecedor");
    if (!prazoModo) return toast.error("Informe o prazo de entrega");
    if (prazoModo === "CUSTOM" && !prazo) return toast.error("Informe a data específica de entrega");
    if (frete === "TRANSPORTADORA" && !trans.trim()) return toast.error("Informe a transportadora");

    // O envio efetivo (PEDIDO_COLOCADO) só acontece quando TODAS as peças já estão aprovadas pela gestão.
    const todasAprovadas = alvos.every((s) => s.status === "PEDIDO_APROVADO_GESTAO");
    let status: Database["public"]["Enums"]["solicitacao_status"];
    if (todasAprovadas) {
      if (!pc.trim()) return toast.error("Informe o Nº do Pedido de Compra para enviar ao fornecedor");
      if (prazoModo === "CUSTOM" && !prazo) return toast.error("Informe a data específica de entrega");
      status = "PEDIDO_COLOCADO";
    } else {
      // Fluxo escalonado obrigatório: todo pedido começa no Coordenador.
      // Gerente/Diretoria só recebem depois da aprovação do nível anterior.
      status = "PEDIDO_EM_APROVACAO_COORD";
    }

    const diasMap: Record<string, number | null> = { IMEDIATA: 0, "3": 3, "7": 7, "15": 15, "30": 30, CUSTOM: null };
    const diasEscolhido = diasMap[prazoModo];

    try {
      await alimentarPedido({
        data: {
          ids: alvos.map((s) => s.id),
          valor_total: v,
          fornecedor: forn,
          numero_pedido_compra: pc,
          prazo_entrega: prazoModo === "CUSTOM" ? (prazo || null) : null,
          prazo_dias_entrega: diasEscolhido,
          tipo_frete: frete,
          transportadora: trans,
          codigo_rastreio: rastreio,
          link_rastreio: link,
          bu: acharAprovador(aprovadores, coord)?.bu ?? null,
          coordenador: acharAprovador(aprovadores, coord)?.coordenador ?? null,
          gerente: acharAprovador(aprovadores, coord)?.gerente ?? null,
          diretor: acharAprovador(aprovadores, coord)?.diretor ?? null,
          status,
        },
      });
      await qc.invalidateQueries({ queryKey: ["solicitacoes"] });
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }


    toast.success(status === "PEDIDO_COLOCADO"
      ? `${alvos.length} peça(s) enviada(s) ao fornecedor`
      : `${alvos.length} peça(s) enviada(s) para aprovação`);
    setModalIds(null);
    setSelecionados({});
  };

  const toggleSel = (id: string) => setSelecionados((c) => ({ ...c, [id]: !c[id] }));
  const idsSelDoBloco = (b: G) => b.itens.filter((s) => selecionados[s.id]).map((s) => s.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Fila de Alimentação do Comprador</h3>
          <p className="text-xs text-muted-foreground">
            {subAba === "TRATAR"
              ? "Peças que ainda precisam ser tratadas (cotar valor, fornecedor e enviar para aprovação)."
              : subAba === "EM_APROVACAO"
                ? "Pedidos já enviados e aguardando aprovação da gestão."
                : subAba === "APROVADOS"
                  ? "Pedidos já aprovados pela gestão — prontos para enviar ao fornecedor."
                  : "Histórico dos e-mails de pedido enviados aos fornecedores."}
          </p>
        </div>
        {subAba !== "ENVIADOS" && (
          <div className="flex items-center gap-2">
            <Input placeholder="Buscar por RC, PED, Máquina, fornecedor..." className="max-w-xs" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              disabled={filtered.length === 0}
              onClick={() => exportarCsvComprador(filtered, subAba)}
            >
              ⬇ Relatório ({filtered.length})
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={subAba === "TRATAR" ? "default" : "outline"}
          onClick={() => { setSubAba("TRATAR"); setSelecionados({}); }}
        >
          🛠 A tratar ({filaTratar.length})
        </Button>
        <Button
          size="sm"
          variant={subAba === "EM_APROVACAO" ? "default" : "outline"}
          className={subAba === "EM_APROVACAO" ? "bg-amber-600 hover:bg-amber-700" : "border-amber-600 text-amber-700 hover:bg-amber-50"}
          onClick={() => { setSubAba("EM_APROVACAO"); setSelecionados({}); }}
        >
          ⏳ Em aprovação ({filaEmAprovacao.length})
        </Button>
        <Button
          size="sm"
          variant={subAba === "APROVADOS" ? "default" : "outline"}
          className={subAba === "APROVADOS" ? "bg-green-600 hover:bg-green-700" : "border-green-600 text-green-700 hover:bg-green-50"}
          onClick={() => { setSubAba("APROVADOS"); setSelecionados({}); }}
        >
          ✅ Aprovados — enviar pedido ({filaAprovados.length})
        </Button>
        <Button
          size="sm"
          variant={subAba === "ENVIADOS" ? "default" : "outline"}
          onClick={() => { setSubAba("ENVIADOS"); setSelecionados({}); }}
        >
          📨 Enviados
        </Button>
      </div>

      {subAba === "ENVIADOS" && <HistoricoEnviosPedidos />}

      {subAba !== "ENVIADOS" && blocos.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {subAba === "TRATAR" ? "Nada para tratar." : subAba === "EM_APROVACAO" ? "Nenhum pedido aguardando aprovação." : "Nenhum pedido aprovado aguardando envio."}
        </p>
      )}

      {subAba !== "ENVIADOS" && blocos.length > 0 && (() => {
        const todosIds = blocos.flatMap((b) => b.itens.map((i) => i.id));
        const totalSel = todosIds.filter((id) => selecionados[id]).length;
        const todosSel = totalSel === todosIds.length && todosIds.length > 0;
        return (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Checkbox
                checked={todosSel}
                onCheckedChange={() => {
                  setSelecionados(() => {
                    if (todosSel) return {};
                    const next: Record<string, boolean> = {};
                    todosIds.forEach((id) => { next[id] = true; });
                    return next;
                  });
                }}
              />
              {todosSel ? "Desmarcar todos" : "Marcar todos"} ({todosIds.length} peças)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{totalSel} selecionada(s)</span>
              <Button size="sm" disabled={totalSel === 0} onClick={() => abrirModal(todosIds.filter((id) => selecionados[id]))}>
                Alimentar {totalSel > 0 ? `${totalSel} ` : ""}em lote
              </Button>
            </div>
          </div>
        );
      })()}


      <div className="space-y-3">
        {(subAba === "ENVIADOS" ? [] : blocos).map((b) => {

          const selIds = idsSelDoBloco(b);
          return (
            <Card key={b.key}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">🔧 {b.equip}</CardTitle>
                    <CardDescription className="text-xs">
                      <span className="block">Modelo: <b>{b.modelo ?? "—"}</b> · Nº série: <b>{b.serie ?? "—"}</b></span>
                      <span className="block">RC <b>{b.rc}</b> · OS <b>{b.os}</b> · Solicitante {b.solicitante} · {b.itens.length} peça(s)</span>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {subAba === "APROVADOS" && (
                      <>
                        <EnviarPedidoFornecedorButton
                          numeroPedido={b.itens.find((i: any) => i.numero_pedido_compra)?.numero_pedido_compra ?? null}
                          pedidoCompraId={b.itens.find((i: any) => i.pedido_compra_id)?.pedido_compra_id ?? null}
                          fornecedorSugerido={b.itens.find((i: any) => i.fornecedor)?.fornecedor ?? null}
                        />
                        <MarcarComoEnviadoButton
                          numeroPedido={b.itens.find((i: any) => i.numero_pedido_compra)?.numero_pedido_compra ?? null}
                          pedidoCompraId={b.itens.find((i: any) => i.pedido_compra_id)?.pedido_compra_id ?? null}
                          fornecedorSugerido={b.itens.find((i: any) => i.fornecedor)?.fornecedor ?? null}
                          solicitacaoIds={b.itens.map((i) => i.id)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-600 text-amber-700 hover:bg-amber-50"
                          disabled={devolvendo}
                          onClick={() => devolverParaAprovacao(selIds.length ? selIds : b.itens.map((i) => i.id))}
                        >
                          ↩ Devolver p/ aprovação{selIds.length ? ` (${selIds.length})` : ""}
                        </Button>
                      </>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive/10"
                      disabled={devolvendo}
                      onClick={() => devolverParaPcm(selIds.length ? selIds : b.itens.map((i) => i.id))}
                      title="Devolver a RC para o PCM corrigir"
                    >
                      ↩ Devolver p/ PCM{selIds.length ? ` (${selIds.length})` : ""}
                    </Button>


                    <Button size="sm" variant="outline" onClick={() => {
                      const all = b.itens.map((i) => i.id);
                      const allSel = all.every((id) => selecionados[id]);
                      setSelecionados((c) => {
                        const next = { ...c };
                        all.forEach((id) => { next[id] = !allSel; });
                        return next;
                      });
                    }}>{b.itens.every((i) => selecionados[i.id]) ? "Desmarcar todas" : "Marcar todas"}</Button>

                    <Button
                      size="sm"
                      className={b.itens.some((i) => selIds.includes(i.id) && i.status === "PEDIDO_APROVADO_GESTAO") ? "bg-green-600 hover:bg-green-700" : ""}
                      disabled={selIds.length === 0}
                      onClick={() => abrirModal(selIds)}
                    >
                      {selIds.length > 0 ? `Alimentar ${selIds.length} em lote` : "Selecione peças"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {b.itens.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-card p-2 text-sm">
                    <label className="flex flex-1 min-w-0 items-start gap-3 cursor-pointer">
                      <Checkbox checked={!!selecionados[s.id]} onCheckedChange={() => toggleSel(s.id)} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium"><span className="text-primary">{s.quantidade}x</span> {s.descricao}</div>
                          <ParalelaBadge s={s} />
                          <DesvioBadge solicitacao={s} />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Cód. {s.codigo_peca ?? "—"}
                          {s.fornecedor && <> · Forn: {s.fornecedor}</>}
                          {s.numero_pedido_compra && <> · PED {s.numero_pedido_compra}</>}
                        </div>
                        {aprovadorAtual(s.status, pedidoDe(s)) && (
                          <div className="mt-1 text-xs font-medium text-amber-700">
                            ⏳ Aguardando {aprovadorAtual(s.status, pedidoDe(s))!.nivel}: {aprovadorAtual(s.status, pedidoDe(s))!.nome}
                          </div>
                        )}
                        {s.foto_peca_path && <div className="mt-2"><FotoPeca path={s.foto_peca_path} /></div>}

                      </div>

                    </label>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.status === "PEDIDO_APROVADO_GESTAO" ? "default" : "outline"} className="text-xs">{statusLabelDe(s)}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className={s.status === "PEDIDO_APROVADO_GESTAO" ? "border-green-600 text-green-700 hover:bg-green-50" : ""}
                        onClick={() => abrirModal([s.id])}
                      >
                        {s.status === "PEDIDO_APROVADO_GESTAO" ? "▶ Enviar" : "Alimentar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!modalIds} onOpenChange={(v) => !v && setModalIds(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {modalIds && modalIds.length > 1 ? `Alimentar ${modalIds.length} peças em lote` : "Alimentação do Comprador"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Preencha os dados do pedido de compra, fornecedor, valor total e prazo de entrega.
            </DialogDescription>
          </DialogHeader>
          {modalIds && (() => {
            const alvos = fila.filter((s) => modalIds.includes(s.id));
            const primeira = alvos[0];
            const todasAprovadas = alvos.every((s) => s.status === "PEDIDO_APROVADO_GESTAO");
            return (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div><span className="text-muted-foreground">RC:</span> <span className="font-semibold text-primary">{primeira?.rc_numero ?? "—"}</span> · Máquina: {primeira?.equipamento?.prefixo_interno} · OS: {primeira?.os_numero}</div>
                <div className="text-xs">Modelo: <b>{(primeira?.equipamento as { modelo?: string | null } | undefined)?.modelo ?? "—"}</b> · Nº série: <b>{(primeira?.equipamento as { numero_serie?: string | null } | undefined)?.numero_serie ?? "—"}</b></div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {alvos.length} peça(s): {alvos.map((s) => `${s.quantidade}x ${s.descricao}`).join(" · ")}
                </div>
                <div className="mt-2 text-xs">
                  {todasAprovadas
                    ? <span className="rounded bg-green-100 px-2 py-1 text-green-800 font-medium">✓ Aprovadas — salvar envia o pedido ao fornecedor</span>
                    : <span className="rounded bg-amber-100 px-2 py-1 text-amber-800 font-medium">⏳ Salvar envia primeiro para o Coordenador; só depois escala para Gerente &gt;5k e Diretoria &gt;20k</span>}
                </div>
              </div>
            );
          })()}
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nº Pedido / Ordem de Compra</Label><Input value={pc} onChange={(e) => setPc(e.target.value.toUpperCase())} className="uppercase" placeholder="Ex: PED-11440" /></div>
              <div>
                <Label>Prazo de entrega</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {PRAZO_OPCOES.map((opcao) => (
                    <Button
                      key={opcao.value}
                      type="button"
                      size="sm"
                      variant={prazoModo === opcao.value ? "default" : "outline"}
                      className="justify-start whitespace-normal text-left"
                      onClick={() => setPrazoModo(opcao.value)}
                    >
                      {opcao.label}
                    </Button>
                  ))}
                </div>
                {prazoModo === "CUSTOM" ? (
                  <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="mt-2" />
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">O prazo será calculado automaticamente a partir da data de envio ao fornecedor (+1 dia de margem).</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor TOTAL do pedido (R$) *</Label><div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input
                    inputMode="numeric"
                    value={valor}
                    onChange={(e) => setValor(mascaraBRL(e.target.value))}
                    placeholder="0,00"
                    className="pl-9 text-right font-medium"
                  />
                </div></div>
              <div><Label>Fornecedor *</Label><Input value={forn} onChange={(e) => setForn(e.target.value.toUpperCase())} className="uppercase" /></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de frete</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {FRETE_OPCOES.map((opcao) => (
                    <Button
                      key={opcao.value}
                      type="button"
                      size="sm"
                      variant={frete === opcao.value ? "default" : "outline"}
                      className="justify-start whitespace-normal text-left"
                      onClick={() => setFrete(opcao.value)}
                    >
                      {opcao.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div><Label>Transportadora</Label><Input value={trans} onChange={(e) => setTrans(e.target.value.toUpperCase())} disabled={frete === "LOCAL"} className="uppercase" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código rastreio</Label><Input value={rastreio} onChange={(e) => setRastreio(e.target.value)} /></div>
              <div><Label>Link rastreio</Label><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." /></div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label>Aprovador imediato — Coordenador (opcional)</Label>
                <EditarAprovadoresBotao />
              </div>
              <select
                value={coord}
                onChange={(e) => setCoord(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— Não informado (o PCM pode preencher depois) —</option>
                {aprovadores.map((a) => (
                  <option key={a.id ?? a.coordenador} value={a.coordenador}>{a.coordenador}</option>
                ))}
              </select>
              {(() => {
                const apr = acharAprovador(aprovadores, coord);
                return apr ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">Gerente: <b>{apr.gerente}</b> · Diretor: <b>{apr.diretor}</b> (preenchidos automaticamente)</p>
                ) : null;
              })()}
            </div>
            <p className="text-xs text-muted-foreground">
              Alçadas escalonadas: todo pedido vai primeiro ao Coordenador; após aprovado, se passar de R$ 5.000 vai ao Gerente; após aprovado, se passar de R$ 20.000 vai à Diretoria.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalIds(null)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ---------- Admin (CRUDs simples) ----------
function AdminTab() {
  return (
    <div className="space-y-6">
      <AdminSolicitantes />
      <AdminEquipamentos />
      <AdminFornecedores />
      <AdminUsuarios />
    </div>

  );
}

function AdminSolicitantes() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["admin", "solicitantes"],
    queryFn: async () => (await supabase.from("solicitantes").select("*").order("nome")).data ?? [],
  });
  const [nome, setNome] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [filtro, setFiltro] = useState("");
  const filtered = rows.filter((r: any) => r.nome.toLowerCase().includes(filtro.toLowerCase()));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Solicitantes ({rows.length})</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>{open ? "Ocultar" : "Mostrar"}</Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Nome do solicitante" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Button onClick={async () => {
              if (!nome.trim()) return;
              const { error } = await supabase.from("solicitantes").insert({ nome: nome.trim() });
              if (error) return toast.error(error.message);
              setNome(""); qc.invalidateQueries({ queryKey: ["admin", "solicitantes"] }); qc.invalidateQueries({ queryKey: ["solicitantes"] });
            }}>Adicionar</Button>
          </div>
          <Input placeholder="Buscar solicitante..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          <ul className="divide-y text-sm max-h-80 overflow-y-auto border rounded-md">
            {filtered.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2 px-2">
                {editId === r.id ? (
                  <>
                    <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8" />
                    <div className="flex gap-1">
                      <Button size="sm" onClick={async () => {
                        if (!editNome.trim()) return;
                        const { error } = await supabase.from("solicitantes").update({ nome: editNome.trim() }).eq("id", r.id);
                        if (error) return toast.error(error.message);
                        setEditId(null);
                        qc.invalidateQueries({ queryKey: ["admin", "solicitantes"] });
                        qc.invalidateQueries({ queryKey: ["solicitantes"] });
                      }}>Salvar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancelar</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span>{r.nome} {!r.ativo && <Badge variant="outline">inativo</Badge>}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditId(r.id); setEditNome(r.nome); }}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await supabase.from("solicitantes").update({ ativo: !r.ativo }).eq("id", r.id);
                        qc.invalidateQueries({ queryKey: ["admin", "solicitantes"] });
                        qc.invalidateQueries({ queryKey: ["solicitantes"] });
                      }}>{r.ativo ? "Inativar" : "Ativar"}</Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

function AdminEquipamentos() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["admin", "equipamentos"],
    queryFn: async () => {
      const pageSize = 1000; let from = 0; const all: any[] = [];
      while (true) {
        const { data } = await supabase.from("equipamentos").select("*").order("prefixo_interno").range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });
  const [prefixo, setPrefixo] = useState(""); const [desc, setDesc] = useState(""); const [armac, setArmac] = useState("");
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [ePrefixo, setEPrefixo] = useState(""); const [eDesc, setEDesc] = useState(""); const [eArmac, setEArmac] = useState("");
  const filtered = rows.filter((r: any) => {
    const q = filtro.toLowerCase();
    return !q || r.prefixo_interno?.toLowerCase().includes(q) || r.descricao?.toLowerCase().includes(q) || r.codigo_armac?.toLowerCase().includes(q);
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Equipamentos ({rows.length})</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>{open ? "Ocultar" : "Mostrar"}</Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Prefixo interno" value={prefixo} onChange={(e) => setPrefixo(e.target.value)} />
            <Input placeholder="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <Input placeholder="Código ARMAC" value={armac} onChange={(e) => setArmac(e.target.value)} />
          </div>
          <Button onClick={async () => {
            if (!prefixo.trim()) return;
            const { error } = await supabase.from("equipamentos").insert({ prefixo_interno: prefixo.trim(), descricao: desc || null, codigo_armac: armac || null });
            if (error) return toast.error(error.message);
            setPrefixo(""); setDesc(""); setArmac("");
            qc.invalidateQueries({ queryKey: ["admin", "equipamentos"] }); qc.invalidateQueries({ queryKey: ["equipamentos"] });
          }}>Adicionar</Button>
          <Input placeholder="Buscar por prefixo, descrição ou código ARMAC..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          <div className="text-xs text-muted-foreground">Mostrando {filtered.length} de {rows.length}</div>
          <ul className="divide-y text-sm max-h-96 overflow-y-auto border rounded-md">
            {filtered.map((r: any) => (
              <li key={r.id} className="py-2 px-2">
                {editId === r.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <Input value={ePrefixo} onChange={(e) => setEPrefixo(e.target.value)} placeholder="Prefixo" />
                      <Input value={eDesc} onChange={(e) => setEDesc(e.target.value)} placeholder="Descrição" />
                      <Input value={eArmac} onChange={(e) => setEArmac(e.target.value)} placeholder="ARMAC" />
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={async () => {
                        if (!ePrefixo.trim()) return;
                        const { error } = await supabase.from("equipamentos").update({
                          prefixo_interno: ePrefixo.trim(),
                          descricao: eDesc || null,
                          codigo_armac: eArmac || null,
                        }).eq("id", r.id);
                        if (error) return toast.error(error.message);
                        setEditId(null);
                        qc.invalidateQueries({ queryKey: ["admin", "equipamentos"] });
                        qc.invalidateQueries({ queryKey: ["equipamentos"] });
                      }}>Salvar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <b>{r.prefixo_interno}</b> — {r.descricao ?? "—"} {r.codigo_armac && <span className="text-muted-foreground">· ARMAC {r.codigo_armac}</span>}
                      {!r.ativo && <Badge variant="outline" className="ml-2">inativo</Badge>}
                    </span>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditId(r.id); setEPrefixo(r.prefixo_interno); setEDesc(r.descricao ?? ""); setEArmac(r.codigo_armac ?? "");
                      }}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await supabase.from("equipamentos").update({ ativo: !r.ativo }).eq("id", r.id);
                        qc.invalidateQueries({ queryKey: ["admin", "equipamentos"] });
                        qc.invalidateQueries({ queryKey: ["equipamentos"] });
                      }}>{r.ativo ? "Inativar" : "Ativar"}</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}


function AdminUsuarios() {
  const qc = useQueryClient();
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles").select("*").order("nome");
      const { data: rr } = await supabase.from("user_roles").select("*");
      return (prof ?? []).map((p) => ({ ...p, roles: (rr ?? []).filter((x) => x.user_id === p.id).map((x) => x.role) }));
    },
  });
  const ROLES: Role[] = ["supervisor", "pcm", "comprador", "coordenador", "gerente", "admin"];
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novosRoles, setNovosRoles] = useState<Role[]>([]);
  const [criando, setCriando] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string } | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuários & Papéis</CardTitle>
        <CardDescription>Cadastre novos usuários e atribua os papéis. No primeiro acesso, o sistema pedirá que troquem a senha.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium text-sm">Novo usuário</div>
          <div className="grid gap-2 md:grid-cols-2">
            <Input placeholder="Nome completo" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
            <Input placeholder="E-mail" type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => {
              const has = novosRoles.includes(r);
              return (
                <Button key={r} size="sm" variant={has ? "default" : "outline"} type="button"
                  onClick={() => setNovosRoles((cur) => has ? cur.filter((x) => x !== r) : [...cur, r])}>
                  {r}
                </Button>
              );
            })}
          </div>
          <Button disabled={criando} onClick={async () => {
            if (!novoNome.trim() || !novoEmail.trim()) return toast.error("Informe nome e e-mail");
            setCriando(true);
            try {
              const { adminCreateUser } = await import("@/lib/admin.functions");
              const res = await adminCreateUser({ data: { nome: novoNome.trim(), email: novoEmail.trim(), roles: novosRoles } });
              setSenhaGerada({ email: res.email, senha: res.tempPassword });
              setNovoNome(""); setNovoEmail(""); setNovosRoles([]);
              qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
              toast.success("Usuário criado");
            } catch (e: any) {
              toast.error(e?.message ?? "Erro ao criar usuário");
            } finally {
              setCriando(false);
            }
          }}>{criando ? "Criando..." : "Criar usuário"}</Button>
        </div>

        <Dialog open={!!senhaGerada} onOpenChange={(o) => !o && setSenhaGerada(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Senha temporária</DialogTitle>
              <DialogDescription className="sr-only">Credenciais geradas para o novo usuário.</DialogDescription>
            </DialogHeader>
            {senhaGerada && (
              <div className="space-y-2 text-sm">
                <p>Envie estas credenciais para o usuário. Ele será obrigado a trocar a senha no primeiro acesso.</p>
                <div className="rounded-md bg-muted p-3 font-mono">
                  <div><b>E-mail:</b> {senhaGerada.email}</div>
                  <div><b>Senha:</b> {senhaGerada.senha}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  navigator.clipboard.writeText(`E-mail: ${senhaGerada.email}\nSenha: ${senhaGerada.senha}`);
                  toast.success("Copiado");
                }}>Copiar</Button>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setSenhaGerada(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ul className="divide-y text-sm">
          {profiles.map((p) => (
            <li key={p.id} className="space-y-2 py-3">
              <div className="font-medium">
                {p.nome} <span className="text-xs text-muted-foreground">{p.email}</span>
                {p.must_change_password && <Badge variant="outline" className="ml-2">senha pendente</Badge>}
              </div>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => {
                  const has = p.roles.includes(r);
                  return (
                    <Button key={r} size="sm" variant={has ? "default" : "outline"} onClick={async () => {
                      if (has) await supabase.from("user_roles").delete().eq("user_id", p.id).eq("role", r);
                      else await supabase.from("user_roles").insert({ user_id: p.id, role: r });
                      qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
                    }}>{r}</Button>
                  );
                })}
                <Button size="sm" variant="ghost" onClick={async () => {
                  if (!confirm(`Gerar nova senha temporária para ${p.email}?`)) return;
                  try {
                    const { adminResetPassword } = await import("@/lib/admin.functions");
                    const res = await adminResetPassword({ data: { userId: p.id } });
                    setSenhaGerada({ email: p.email ?? "", senha: res.tempPassword });
                    qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
                  } catch (e: any) { toast.error(e?.message ?? "Erro"); }
                }}>Resetar senha</Button>
              </div>
            </li>
          ))}
          {profiles.length === 0 && <li className="py-4 text-muted-foreground">Nenhum usuário cadastrado ainda.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}

