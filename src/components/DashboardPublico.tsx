import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSolicitacoes } from "@/lib/solicitacoes.functions";
import DesvioBadge from "@/components/DesvioBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, SlidersHorizontal, BarChart3 } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  SOLICITADA: "AGUARDANDO SUPERVISOR",
  APROVADA_SUPERVISOR: "FILA DO PCM",
  EM_TRATAMENTO_PCM: "RC CRIADA",
  EM_TRATATIVA_PCM: "RC CRIADA",
  PENDENCIA_SOLICITANTE: "DEVOLVIDA AO SOLICITANTE",
  PEDIDO_EM_APROVACAO_COORD: "PEDIDO EM APROVAÇÃO — COORDENADOR",
  PEDIDO_EM_APROVACAO_GERENTE: "PEDIDO EM APROVAÇÃO — GERENTE",
  PEDIDO_EM_APROVACAO_DIRETORIA: "PEDIDO EM APROVAÇÃO — DIRETORIA",
  PEDIDO_APROVADO_GESTAO: "PEDIDO APROVADO — ENVIAR",
  PEDIDO_COLOCADO: "ENVIADO AO FORNECEDOR",
  EM_TRANSITO: "ENVIADO AO FORNECEDOR",
  RECEBIDA_ALMOX: "RECEBIDA NO ALMOXARIFADO",
  ENTREGUE_MECANICO: "ENTREGUE AO SOLICITANTE",
  FINALIZADA: "FINALIZADA",
  REPROVADA: "REPROVADA PELO SUPERVISOR",
  CANCELADA_SUPERVISOR: "CANCELADA PELO SUPERVISOR",
  CANCELADA: "CANCELADA",
  PEDIDO_REPROVADO_GESTAO: "PEDIDO REJEITADO",
};

const diffDias = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
};
const media = (arr: (number | null)[]) => {
  const v = arr.filter((n): n is number => n !== null && !isNaN(n) && n >= 0);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
};
const fmtDias = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)} Dias`);

export function DashboardPublico() {
  const listSolic = useServerFn(listSolicitacoes);
  const { data: items = [] } = useQuery({
    queryKey: ["dashboard-publico"],
    queryFn: () => listSolic({ data: { limit: 2000 } }),
    refetchInterval: 30000,
  });

  const [busca, setBusca] = useState("");
  const buscaTrim = busca.trim();
  const { data: resultados = [] } = useQuery({
    queryKey: ["dashboard-busca", buscaTrim],
    queryFn: () => listSolic({ data: { busca: buscaTrim } }),
    enabled: buscaTrim.length >= 2,
  });

  const stats = useMemo(() => {
    const lt1 = media(items.map((s) => diffDias(s.created_at, s.aprovador_gestao_at ?? s.supervisor_at)));
    const lt2 = media(items.map((s) => diffDias(s.supervisor_at, s.pcm_at)));
    const lt3 = media(items.map((s) => diffDias(s.comprador_at, s.data_recebimento_almox)));
    const ltTotal = media(items.map((s) => diffDias(s.created_at, s.data_entrega_mecanico)));

    const finalizadas = ["ENTREGUE_MECANICO", "FINALIZADA", "RECEBIDA_ALMOX"];
    const canceladas = ["CANCELADA_SUPERVISOR", "REPROVADA", "PEDIDO_REPROVADO_GESTAO", "CANCELADA"];
    // "Sem pedido" = RC já emitida que ainda não teve pedido de compra colocado (ignora entregues/canceladas e itens sem RC)
    const semPedidoItens = items.filter(
      (s) => !!s.rc_numero && !s.numero_pedido_compra && !(s as { reserva_numero?: string | null }).reserva_numero && !finalizadas.includes(s.status) && !canceladas.includes(s.status),
    );
    const semPedido = semPedidoItens.length;
    const totalPecas = items.reduce((acc, s) => acc + (Number(s.quantidade) || 0), 0);

    const pipeline = {
      supervisao: items.filter((s) => s.status === "SOLICITADA").length,
      semRC: items.filter((s) => ["APROVADA_SUPERVISOR", "EM_TRATATIVA_PCM", "PENDENCIA_SOLICITANTE"].includes(s.status)).length,
      comRC: items.filter((s) => ["AGUARDANDO_APROVACAO_COORDENADOR", "AGUARDANDO_APROVACAO_GERENTE", "AGUARDANDO_APROVACAO_DIRETORIA", "APROVADA_GESTAO"].includes(s.status)).length,
      comPedido: items.filter((s) => ["PEDIDO_COLOCADO", "EM_TRANSITO", "RECEBIDA_ALMOX", "ENTREGUE_MECANICO", "FINALIZADA"].includes(s.status)).length,
      canceladas: items.filter((s) => canceladas.includes(s.status)).length,
    };

    const agora = Date.now();
    const bucket = (dMin: number, dMax: number | null) =>
      semPedidoItens.filter((s) => {
        const d = (agora - new Date(s.created_at).getTime()) / 86400000;
        return d >= dMin && (dMax === null || d < dMax);
      }).length;
    const aging = {
      a3: bucket(0, 3),
      a7: bucket(3, 7),
      a15: bucket(7, 15),
      a30: bucket(15, 30),
      acima: bucket(30, null),
    };

    return { lt1, lt2, lt3, ltTotal, semPedido, totalPecas, pipeline, aging };
  }, [items]);


  return (
    <section className="space-y-4">
      {/* KPIs principais */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="RCs SEM PEDIDO" valor={String(stats.semPedido)} legenda="Aguardando colocação do pedido" destaque={stats.semPedido > 0} />
        <StatCard label="LEAD TIME 1" valor={fmtDias(stats.lt1)} legenda="Solicitação → Aprovação" />
        <StatCard label="LEAD TIME 2" valor={fmtDias(stats.lt2)} legenda="Aprovação → Tratativa PCM" />
        <StatCard label="LEAD TIME 3" valor={fmtDias(stats.lt3)} legenda="Pedido → Recebimento" />
      </div>

      {/* Pipeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="h-4 w-4 text-primary" /> Pipeline de Fluxo de Compras (Status das Peças)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <PipelinePill n={stats.pipeline.supervisao} label="NA SUPERVISÃO" tone="amber" />
            <PipelinePill n={stats.pipeline.semRC} label="SEM RC" tone="slate" />
            <PipelinePill n={stats.pipeline.comRC} label="COM RC" tone="violet" />
            <PipelinePill n={stats.pipeline.comPedido} label="COM PEDIDO" tone="emerald" />
            <PipelinePill n={stats.pipeline.canceladas} label="CANCELADAS" tone="rose" />
          </div>
        </CardContent>
      </Card>

      {/* Aging */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Aging (Envelhecimento de RCs sem Pedido) — <span className="text-muted-foreground font-normal">RCs sem pedido: <b className="text-foreground">{stats.semPedido}</b></span></CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <AgingCell label="ATÉ 3 DIAS" n={stats.aging.a3} />
            <AgingCell label="DE 3 A 7 DIAS" n={stats.aging.a7} />
            <AgingCell label="DE 7 A 15 DIAS" n={stats.aging.a15} />
            <AgingCell label="DE 15 A 30 DIAS" n={stats.aging.a30} />
            <AgingCell label="ACIMA DE 30 DIAS" n={stats.aging.acima} destaque />
          </div>
        </CardContent>
      </Card>

      {/* Rastreador */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4 text-primary" /> Rastreador de Pedidos (Autoatendimento)</CardTitle>
          <CardDescription>Pesquise por Máquina, OS, código de peça, RC, nº do pedido ou fornecedor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquise por OS, Código, Descrição, Máquina ou RC…"
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {busca.trim() && (
            <div className="space-y-3">
              {resultados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum resultado.</p>}
              {resultados.map((s) => <TimelineCard key={s.id} s={s} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function StatCard({ label, valor, legenda, destaque }: { label: string; valor: string; legenda: string; destaque?: boolean }) {
  return (
    <Card className={destaque ? "border-amber-300 bg-amber-50" : ""}>
      <CardHeader className="pb-2">
        <CardDescription className={`text-[11px] font-semibold tracking-wider ${destaque ? "text-amber-700" : ""}`}>{label}</CardDescription>
        <CardTitle className={`text-2xl ${destaque ? "text-amber-700" : ""}`}>{valor}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground">{legenda}</p>
      </CardContent>
    </Card>
  );
}

const TONES: Record<string, string> = {
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  slate: "bg-slate-50 text-slate-700 border-slate-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
};

function PipelinePill({ n, label, tone }: { n: number; label: string; tone: keyof typeof TONES }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-md border p-3 ${TONES[tone]}`}>
      <div className="text-2xl font-bold">{n}</div>
      <div className="text-[10px] font-semibold tracking-wider">{label}</div>
    </div>
  );
}

function AgingCell({ label, n, destaque }: { label: string; n: number; destaque?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${destaque && n > 0 ? "border-rose-300 bg-rose-50" : "bg-card"}`}>
      <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${destaque && n > 0 ? "text-rose-600" : ""}`}>{n} RCs</div>
    </div>
  );
}

type SolicRow = {
  id: string;
  status: string;
  os_numero: string;
  quantidade: number;
  descricao: string;
  codigo_peca: string | null;
  rc_numero: string | null;
  numero_pedido_compra: string | null;
  fornecedor: string | null;
  valor_total: number | null;
  prazo_entrega: string | null;
  codigo_rastreio: string | null;
  link_rastreio: string | null;
  transportadora: string | null;
  motivo_reprovacao_supervisor: string | null;
  motivo_reprovacao_gestao: string | null;
  pcm_motivo_pendencia: string | null;
  observacao_recebimento: string | null;
  observacao_retirada: string | null;
  created_at: string;
  supervisor_at: string | null;
  pcm_at: string | null;
  comprador_at: string | null;
  aprovador_gestao_at: string | null;
  data_recebimento_almox: string | null;
  data_entrega_mecanico: string | null;
  solicitante: { id: string; nome: string } | null;
  equipamento: { id: string; prefixo_interno: string | null; codigo_armac: string | null; descricao: string | null } | null;
  vai_para_outro?: boolean | null;
  equipamento_uso?: { prefixo_interno: string | null; codigo_armac: string | null } | null;
  em_cadastro?: boolean | null;
  pedido?: { valor_total: number | null } | null;
};

const fmtDT = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function TimelineCard({ s }: { s: SolicRow }) {
  const eq = s.equipamento;
  const cancelada = ["CANCELADA_SUPERVISOR", "REPROVADA", "PEDIDO_REPROVADO_GESTAO", "CANCELADA"].includes(s.status);
  const rank: Record<string, number> = {
    SOLICITADA: 1,
    PENDENCIA_SOLICITANTE: 1,
    APROVADA_SUPERVISOR: 2,
    EM_TRATATIVA_PCM: 2,
    EM_TRATAMENTO_PCM: 3,
    AGUARDANDO_ORCAMENTO: 3,
    ORCAMENTO_RECEBIDO: 3,
    AGUARDANDO_APROVACAO_COORDENADOR: 3,
    AGUARDANDO_APROVACAO_GERENTE: 3,
    AGUARDANDO_APROVACAO_DIRETORIA: 3,
    PEDIDO_EM_APROVACAO_COORD: 3,
    PEDIDO_EM_APROVACAO_GERENTE: 3,
    PEDIDO_EM_APROVACAO_DIRETORIA: 3,
    APROVADA_GESTAO: 4,
    PEDIDO_APROVADO_GESTAO: 4,
    PEDIDO_COLOCADO: 5,
    EM_TRANSITO: 5,
    RECEBIDA_ALMOX: 6,
    ENTREGUE_MECANICO: 7,
    FINALIZADA: 7,
  };
  const cur = rank[s.status] ?? 0;

  const etapas: { n: number; titulo: string; data: string | null; extra?: React.ReactNode; done: boolean; ordem: number }[] = [
    { n: 1, titulo: "Solicitação Aberta", data: fmtDT(s.created_at), done: true, ordem: 1,
      extra: <>Solicitante: <b>{s.solicitante?.nome ?? "—"}</b></> },
    { n: 2, titulo: "Aprovação Técnica (Supervisor)", data: fmtDT(s.supervisor_at), done: !!s.supervisor_at || cur >= 2, ordem: 2 },
    { n: 3, titulo: "RC Emitida pelo PCM", data: fmtDT(s.pcm_at), done: !!s.pcm_at || cur >= 3, ordem: 3,
      extra: s.rc_numero ? <span className="text-primary">RC: <b>{s.rc_numero}</b></span> : null },
    { n: 4, titulo: "Aprovação da Gestão (Coord. / Gerência / Diretoria)", data: fmtDT(s.aprovador_gestao_at), done: !!s.aprovador_gestao_at || cur >= 4, ordem: 4,
      extra: s.pedido?.valor_total ? <>Valor do pedido: <b>R$ {Number(s.pedido.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b></> : null },
    { n: 5, titulo: "Ordem de Compra Gerada", data: fmtDT(s.comprador_at), done: !!s.comprador_at || cur >= 5, ordem: 5,
      extra: (s.numero_pedido_compra || s.fornecedor) ? <>{s.numero_pedido_compra && <>PED: <b>{s.numero_pedido_compra}</b></>}{s.fornecedor && <> · {s.fornecedor}</>}</> : null },
    { n: 6, titulo: "Pedido Enviado ao Fornecedor", data: cur >= 5 ? fmtDT(s.comprador_at) : null, done: cur >= 5, ordem: 5,
      extra: (s.codigo_rastreio || s.prazo_entrega) ? <>{s.transportadora && <>{s.transportadora} · </>}{s.codigo_rastreio && <>Rastreio: <b>{s.codigo_rastreio}</b> · </>}{s.prazo_entrega && <>Prazo: {new Date(s.prazo_entrega).toLocaleDateString("pt-BR")}</>}</> : null },
    { n: 7, titulo: "Recebido no Almoxarifado", data: fmtDT(s.data_recebimento_almox), done: !!s.data_recebimento_almox || cur >= 6, ordem: 6 },
    { n: 8, titulo: "Entregue ao Solicitante", data: fmtDT(s.data_entrega_mecanico), done: !!s.data_entrega_mecanico || cur >= 7, ordem: 7 },
  ];


  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      {/* Cabeçalho compacto em uma linha */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant="secondary" className="uppercase tracking-wider text-[10px] shrink-0">
          {eq?.prefixo_interno ?? "?"}{eq?.codigo_armac ? ` · ${eq.codigo_armac}` : ""}
        </Badge>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">
          {s.quantidade}x {s.descricao}
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {s.codigo_peca && <>Cód: <b>{s.codigo_peca}</b> · </>}OS: <b>{s.os_numero}</b>
          {s.rc_numero && <> · RC: <b>{s.rc_numero}</b></>}
          {s.numero_pedido_compra && <> · PED: <b>{s.numero_pedido_compra}</b></>}
        </div>
        <DesvioBadge solicitacao={s} className="whitespace-nowrap shrink-0" />
        {s.em_cadastro && (
          <Badge variant="destructive" className="whitespace-nowrap shrink-0 animate-pulse">
            🔴 EM CADASTRO NO SAP
          </Badge>
        )}
        <Badge variant={cancelada ? "destructive" : "outline"} className="whitespace-nowrap shrink-0">
          {STATUS_LABEL[s.status] ?? s.status}
        </Badge>
      </div>

      {/* Timeline horizontal — linha do tempo */}
      <div className="relative mt-3 overflow-x-auto">
        <ol className="flex min-w-max items-start gap-0">
          {etapas.map((e, idx) => {
            const ativa = !cancelada && e.done;
            const atual = !cancelada && !e.done && cur === e.ordem;
            const isLast = idx === etapas.length - 1;
            return (
              <li key={e.n} className="relative flex flex-1 min-w-[130px] flex-col items-center">
                {/* Conector para o próximo passo */}
                {!isLast && (
                  <div
                    className={`absolute top-3 left-1/2 h-0.5 w-full ${
                      !cancelada && etapas[idx + 1].done ? "bg-emerald-500" : "bg-muted"
                    }`}
                  />
                )}
                <div
                  className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    ativa
                      ? "bg-emerald-500 text-white"
                      : atual
                      ? "bg-amber-100 text-amber-700 border border-amber-300 animate-pulse"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {ativa ? "✓" : e.n}
                </div>
                <div className="mt-1 px-1 text-center">
                  <div className={`text-[11px] font-semibold leading-tight ${ativa ? "" : atual ? "text-amber-700" : "text-muted-foreground"}`}>
                    {e.titulo}
                  </div>
                  {e.data && <div className="text-[10px] text-muted-foreground">{e.data}</div>}
                  {e.extra && <div className="text-[10px] text-muted-foreground">{e.extra}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {(s.motivo_reprovacao_supervisor || s.motivo_reprovacao_gestao || s.pcm_motivo_pendencia) && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          {s.motivo_reprovacao_supervisor && <div><b>Reprovação Supervisor:</b> {s.motivo_reprovacao_supervisor}</div>}
          {s.motivo_reprovacao_gestao && <div><b>Reprovação Gestão:</b> {s.motivo_reprovacao_gestao}</div>}
          {s.pcm_motivo_pendencia && <div><b>Devolvida pelo PCM:</b> {s.pcm_motivo_pendencia}</div>}
        </div>
      )}
    </div>
  );
}

