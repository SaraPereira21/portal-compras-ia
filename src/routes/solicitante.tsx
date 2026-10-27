import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useMemo, useEffect } from "react";
import {
  listSolicitantes,
  listEquipamentos,
  listSolicitacoes,
  checkDuplicidade,
  criarSolicitacao,
  confirmarRecebimentoSolicitante,
  apontarNaoRecebidoSolicitante,
  corrigirPendenciaSolicitante,
  extrairItensDeOrcamento,
  listOsDoEquipamento,
} from "@/lib/solicitacoes.functions";
import { criarConsumoMaterial, listMeusConsumos, editarMeuConsumo, confirmarRetiradaConsumo } from "@/lib/solicitacoes.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


import { supabase } from "@/integrations/supabase/client";
import BuscaMaterialAlmox from "@/components/BuscaMaterialAlmox";
import MiniEstoqueBadge from "@/components/MiniEstoqueBadge";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Upload, AlertTriangle, CheckCircle2, Check, ChevronsUpDown, Trash2, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import DesvioBadge from "@/components/DesvioBadge";

export const Route = createFileRoute("/solicitante")({
  head: () => ({ meta: [{ title: "Solicitante — Portal de Compras" }] }),
  component: SolicitantePage,
});

type Equip = { id: string; prefixo_interno: string; codigo_armac: string | null; descricao: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function SolicitantePage() {
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    const v = localStorage.getItem("solicitante_id");
    if (v && UUID_RE.test(v)) setMeId(v);
    else if (v) localStorage.removeItem("solicitante_id");
  }, []);

  const listSol = useServerFn(listSolicitantes);
  const { data: solicitantes = [] } = useQuery({
    queryKey: ["solicitantes"],
    queryFn: () => listSol(),
  });

  // Guarda extra: se o id salvo não existe mais na lista, força re-seleção
  useEffect(() => {
    if (meId && solicitantes.length > 0 && !solicitantes.some((s) => s.id === meId)) {
      localStorage.removeItem("solicitante_id");
      setMeId(null);
    }
  }, [meId, solicitantes]);

  if (!meId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Quem é você?</CardTitle>
            <CardDescription>Escolha seu nome na lista para começar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select onValueChange={(v) => { localStorage.setItem("solicitante_id", v); setMeId(v); }}>
              <SelectTrigger><SelectValue placeholder="Selecionar solicitante..." /></SelectTrigger>
              <SelectContent>
                {solicitantes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
                {solicitantes.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">
                    Nenhum solicitante cadastrado. Peça a um Admin.
                  </div>
                )}
              </SelectContent>
            </Select>
            <Link to="/" className="block text-center text-xs text-muted-foreground">← voltar</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const me = solicitantes.find((s) => s.id === meId);
  return <SolicitanteInterior meId={meId} meNome={me?.nome ?? "…"} onSair={() => { localStorage.removeItem("solicitante_id"); setMeId(null); }} />;
}

function SolicitanteInterior({ meId, meNome, onSair }: { meId: string; meNome: string; onSair: () => void }) {
  const [openNova, setOpenNova] = useState(false);
  const listSolic = useServerFn(listSolicitacoes);
  const { data: minhas = [], isError, error, refetch, isFetching } = useQuery({
    queryKey: ["solicitacoes", "minhas", meId],
    queryFn: () => listSolic({ data: { solicitante_id: meId } }),
    enabled: UUID_RE.test(meId),
    retry: 1,
  });

  return (
    <div className="min-h-screen bg-muted">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Solicitante</p>
            <p className="font-semibold">{meNome}</p>
          </div>
          <button onClick={onSair} className="text-xs text-muted-foreground hover:text-foreground">
            trocar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <Tabs defaultValue="rcs">
          <TabsList className="mb-4">
            <TabsTrigger value="rcs">🔧 Peças (RC)</TabsTrigger>
            <TabsTrigger value="consumo">🧰 Material de consumo</TabsTrigger>
          </TabsList>

          <TabsContent value="rcs">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Minhas solicitações</h2>
              <Button onClick={() => setOpenNova(true)}><Plus className="mr-2 h-4 w-4" /> Nova RC</Button>
            </div>

            {isError ? (
              <Card>
                <CardContent className="space-y-3 py-8 text-center">
                  <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
                  <div>
                    <p className="font-semibold">Não consegui carregar suas solicitações agora.</p>
                    <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
                  </div>
                  <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>Tentar novamente</Button>
                </CardContent>
              </Card>
            ) : (
              <MinhasSolicitacoes solic={minhas} meId={meId} meNome={meNome} />
            )}
          </TabsContent>

          <TabsContent value="consumo">
            <ConsumoMaterialTab meId={meId} />
          </TabsContent>
        </Tabs>
      </main>


      <NovaSolicitacaoDialog open={openNova} onOpenChange={setOpenNova} meId={meId} meNome={meNome} />
    </div>
  );
}


const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  SOLICITADA: { label: "AGUARDANDO SUPERVISOR", variant: "secondary" },
  APROVADA_SUPERVISOR: { label: "FILA DO PCM", variant: "default" },
  CANCELADA_SUPERVISOR: { label: "REJEITADO PELO SUPERVISOR", variant: "destructive" },
  CANCELADA: { label: "CANCELADA", variant: "destructive" },
  EM_TRATAMENTO_PCM: { label: "RC CRIADA", variant: "default" },
  AGUARDANDO_ORCAMENTO: { label: "AGUARDANDO ORÇAMENTO", variant: "secondary" },
  ORCAMENTO_RECEBIDO: { label: "ORÇAMENTO RECEBIDO", variant: "default" },
  PEDIDO_EM_APROVACAO_COORD: { label: "PEDIDO EM APROVAÇÃO — COORDENADOR", variant: "secondary" },
  PEDIDO_EM_APROVACAO_GERENTE: { label: "PEDIDO EM APROVAÇÃO — GERENTE", variant: "secondary" },
  PEDIDO_EM_APROVACAO_DIRETORIA: { label: "PEDIDO EM APROVAÇÃO — DIRETORIA", variant: "secondary" },
  PEDIDO_APROVADO_GESTAO: { label: "PEDIDO APROVADO — ENVIAR", variant: "default" },
  PEDIDO_REPROVADO_GESTAO: { label: "PEDIDO REJEITADO", variant: "destructive" },
  PEDIDO_COLOCADO: { label: "ENVIADO AO FORNECEDOR", variant: "default" },
  EM_TRANSITO: { label: "ENVIADO AO FORNECEDOR", variant: "default" },
  RECEBIDA_ALMOX: { label: "🚨 RECEBIDA NO ALMOX — RETIRAR!", variant: "destructive" },
  PENDENCIA_SOLICITANTE: { label: "⚠ PENDÊNCIA — REVISE", variant: "destructive" },
  ENTREGUE_MECANICO: { label: "ENTREGUE AO SOLICITANTE", variant: "default" },
  FINALIZADA: { label: "FINALIZADA", variant: "outline" },
  REPROVADA: { label: "REPROVADA PELO SUPERVISOR", variant: "destructive" },
};

type Solic = Awaited<ReturnType<typeof listSolicitacoes>>[number];

function RCItem({ solic, meId, meNome }: { solic: Solic; meId: string; meNome: string }) {
  const st = STATUS_LABELS[solic.status] ?? { label: solic.status, variant: "outline" as const };
  const confirmar = useServerFn(confirmarRecebimentoSolicitante);
  const corrigir = useServerFn(corrigirPendenciaSolicitante);
  const qc = useQueryClient();
  const receber = useMutation({
    mutationFn: () => {
      if (!UUID_RE.test(meId)) {
        localStorage.removeItem("solicitante_id");
        throw new Error("Sessão inválida — selecione seu nome novamente.");
      }
      return confirmar({ data: { id: solic.id, solicitante_id: meId, nome: meNome } });
    },
    onSuccess: () => { toast.success("Recebimento confirmado!"); qc.invalidateQueries({ queryKey: ["solicitacoes"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const apontarFalta = useServerFn(apontarNaoRecebidoSolicitante);
  const [faltaOpen, setFaltaOpen] = useState(false);
  const [qtdRecebida, setQtdRecebida] = useState("");
  const [motivoFalta, setMotivoFalta] = useState("");
  const naoRecebi = useMutation({
    mutationFn: () => {
      if (!UUID_RE.test(meId)) {
        localStorage.removeItem("solicitante_id");
        throw new Error("Sessão inválida — selecione seu nome novamente.");
      }
      const q = qtdRecebida.trim() === "" ? null : Number(qtdRecebida.replace(",", "."));
      if (q !== null && (Number.isNaN(q) || q < 0)) throw new Error("Quantidade recebida inválida.");
      return apontarFalta({ data: { id: solic.id, solicitante_id: meId, nome: meNome, quantidade_recebida: q, motivo: motivoFalta } });
    },
    onSuccess: () => {
      toast.success("Peça apontada como não recebida — voltou para EM TRÂNSITO");
      setFaltaOpen(false);
      setQtdRecebida("");
      setMotivoFalta("");
      qc.invalidateQueries({ queryKey: ["solicitacoes"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [novoCod, setNovoCod] = useState(solic.codigo_peca ?? "");
  const [novaDesc, setNovaDesc] = useState(solic.descricao);
  const [novaObs, setNovaObs] = useState((solic as { observacoes_gerais?: string | null }).observacoes_gerais ?? "");
  const corrigirMut = useMutation({
    mutationFn: () => {
      if (!UUID_RE.test(meId)) {
        localStorage.removeItem("solicitante_id");
        throw new Error("Sessão inválida — selecione seu nome novamente.");
      }
      return corrigir({ data: { id: solic.id, solicitante_id: meId, codigo_peca: novoCod, descricao: novaDesc, observacao: novaObs } });
    },
    onSuccess: () => { toast.success("Peça corrigida e reenviada ao supervisor"); setEditOpen(false); qc.invalidateQueries({ queryKey: ["solicitacoes"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="rounded border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium">{solic.descricao}</div>
            <DesvioBadge solicitacao={solic} />
          </div>
          <div className="text-xs text-muted-foreground">
            Qtd {solic.quantidade} {solic.unidade} · {solic.urgencia}
            {solic.codigo_peca ? ` · cód. ${solic.codigo_peca}` : ""}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {solic.numero_pedido_compra && <span>PC #{solic.numero_pedido_compra}</span>}
            {solic.prazo_entrega && <span>Prazo: {new Date(solic.prazo_entrega).toLocaleDateString("pt-BR")}</span>}
            {solic.fornecedor && <span>Forn: {solic.fornecedor}</span>}
          </div>
          {(solic as { reserva_numero?: string | null }).reserva_numero && (
            <div className="mt-2 rounded border border-sky-300 bg-sky-50 p-2 text-xs text-sky-900">
              📦 <b>Material do almoxarifado</b> — Reserva <b>{(solic as { reserva_numero?: string | null }).reserva_numero}</b>
              {solic.status === "RECEBIDA_ALMOX" ? " · LIBERADO, pode retirar no almoxarifado." : " · aguardando aprovação."}
            </div>
          )}

          {solic.status === "PENDENCIA_SOLICITANTE" && (solic as { pcm_motivo_pendencia?: string | null }).pcm_motivo_pendencia && (
            <div className="mt-2 rounded border border-orange-300 bg-orange-50 p-2 text-xs text-orange-900">
              <b>Motivo do PCM:</b> {(solic as { pcm_motivo_pendencia?: string | null }).pcm_motivo_pendencia}
            </div>
          )}
        </div>
        <Badge variant={st.variant} className="shrink-0">{st.label}</Badge>
      </div>
      {solic.status === "RECEBIDA_ALMOX" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={() => receber.mutate()} disabled={receber.isPending} size="sm">
            <CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar que recebi
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-red-500 text-red-700 hover:bg-red-50"
            onClick={() => setFaltaOpen(true)}
          >
            <AlertTriangle className="mr-2 h-4 w-4" /> Peça não recebida
          </Button>
        </div>
      )}

      <Dialog open={faltaOpen} onOpenChange={setFaltaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Peça não recebida no almoxarifado</DialogTitle>
            <DialogDescription>
              Informe o que você encontrou. A peça volta automaticamente para EM TRÂNSITO.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded border bg-muted/40 p-2 text-xs">
              {solic.descricao} · pedido de {solic.quantidade} {solic.unidade}
            </div>
            <div>
              <Label>Quantidade que você recebeu (deixe vazio se não veio nada)</Label>
              <Input
                inputMode="decimal"
                placeholder="Ex.: 5"
                value={qtdRecebida}
                onChange={(e) => setQtdRecebida(e.target.value)}
              />
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Textarea
                rows={3}
                value={motivoFalta}
                onChange={(e) => setMotivoFalta(e.target.value.toUpperCase())}
                className="uppercase"
                placeholder="EX.: VEIO SÓ PARTE DO PEDIDO"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFaltaOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => naoRecebi.mutate()} disabled={naoRecebi.isPending}>
              {naoRecebi.isPending ? "Enviando..." : "Voltar para EM TRÂNSITO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {solic.status === "PENDENCIA_SOLICITANTE" && (
        <div className="mt-2">
          <Button size="sm" variant="outline" className="border-orange-500 text-orange-700 hover:bg-orange-50" onClick={() => setEditOpen(true)}>
            ✎ Corrigir e reenviar
          </Button>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corrigir peça e reenviar ao supervisor</DialogTitle>
            <DialogDescription>Ajuste o código/descrição conforme apontado pelo PCM.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Código original *</Label>
              <Input value={novoCod} onChange={(e) => setNovoCod(e.target.value.toUpperCase())} className="uppercase" />
            </div>
            <div>
              <Label>Descrição *</Label>
              <Textarea rows={3} value={novaDesc} onChange={(e) => setNovaDesc(e.target.value.toUpperCase())} className="uppercase" />
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Input value={novaObs} onChange={(e) => setNovaObs(e.target.value.toUpperCase())} className="uppercase" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={() => corrigirMut.mutate()} disabled={corrigirMut.isPending}>
              {corrigirMut.isPending ? "Enviando..." : "Reenviar ao supervisor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MinhasSolicitacoes({ solic, meId, meNome }: { solic: Solic[]; meId: string; meNome: string }) {
  const [busca, setBusca] = useState("");
  const filtradas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    if (!q) return solic;
    return solic.filter((s) => {
      const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null; descricao?: string } }).equipamento;
      const hay = `${s.os_numero} ${s.descricao} ${s.codigo_peca ?? ""} ${eq?.prefixo_interno ?? ""} ${eq?.codigo_armac ?? ""} ${eq?.descricao ?? ""}`.toUpperCase();
      return hay.includes(q);
    });
  }, [solic, busca]);

  const blocos = useMemo(() => {
    const map = new Map<string, { key: string; os: string; equipNome: string; itens: Solic[] }>();
    for (const s of filtradas) {
      const eq = (s as { equipamento?: { prefixo_interno?: string; codigo_armac?: string | null } }).equipamento;
      const key = `${s.os_numero}::${s.equipamento_id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          os: s.os_numero,
          equipNome: `${eq?.prefixo_interno ?? "?"}${eq?.codigo_armac ? " · cod. " + eq.codigo_armac : ""}`,
          itens: [],
        });
      }
      map.get(key)!.itens.push(s);
    }
    return Array.from(map.values());
  }, [filtradas]);

  if (solic.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhuma solicitação ainda. Clique em <b>Nova RC</b> para começar.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Input placeholder="Buscar por OS, máquina, código ou descrição..." value={busca} onChange={(e) => setBusca(e.target.value)} className="uppercase" />
      {blocos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum resultado para "{busca}".</p>}
      {blocos.map((b) => (
        <Card key={b.key}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">🔧 {b.equipNome}</CardTitle>
            <CardDescription>OS <b>{b.os}</b> · {b.itens.length} peça(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {b.itens.map((s) => <RCItem key={s.id} solic={s} meId={meId} meNome={meNome} />)}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}


// ==================== Combobox de equipamento (com busca) ====================

function EquipamentoCombobox({
  equipamentos,
  value,
  onChange,
  placeholder = "Buscar máquina...",
  loading = false,
}: {
  equipamentos: Equip[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const selected = equipamentos.find((e) => e.id === value);
  const visiveis = useMemo(() => {
    const q = busca.trim().toUpperCase();
    const base = q
      ? equipamentos.filter((e) => `${e.prefixo_interno} ${e.codigo_armac ?? ""} ${e.descricao ?? ""}`.toUpperCase().includes(q))
      : equipamentos;
    return base.slice(0, 80);
  }, [equipamentos, busca]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate text-left">
            {selected ? `${selected.prefixo_interno} — ${selected.descricao}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput value={busca} onValueChange={setBusca} placeholder="Buscar por prefixo, código ou descrição..." />
          <CommandList className="max-h-72 overflow-y-auto overscroll-contain">
            <CommandEmpty>{loading ? "Carregando frota..." : "Nenhum equipamento encontrado."}</CommandEmpty>
            <CommandGroup>
              {visiveis.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.prefixo_interno} ${e.codigo_armac ?? ""} ${e.descricao}`}
                  onSelect={() => { onChange(e.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === e.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate"><b>{e.prefixo_interno}</b> — {e.descricao}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {equipamentos.length > visiveis.length && (
              <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                Mostrando {visiveis.length} de {equipamentos.length}. Digite mais para filtrar.
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ==================== Nova solicitação em LOTE ====================

type ItemLote = {
  key: string;
  quantidade: string;
  unidade: string;
  codigo_peca: string;
  descricao: string;
  urgencia: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
  vai_para_outro: boolean;
  equipamento_uso_id: string;
  foto: File | null;
  justificativa_duplicidade: string;
  observacao: string;
  pode_ser_paralela: boolean;
};

function novoItem(): ItemLote {
  return {
    key: crypto.randomUUID(),
    quantidade: "",
    unidade: "UN",
    codigo_peca: "",
    descricao: "",
    urgencia: "MEDIA",
    vai_para_outro: false,
    equipamento_uso_id: "",
    foto: null,
    justificativa_duplicidade: "",
    observacao: "",
    pode_ser_paralela: true,
  };
}


function NovaSolicitacaoDialog({ open, onOpenChange, meId, meNome }: {
  open: boolean; onOpenChange: (v: boolean) => void; meId: string; meNome: string;
}) {
  const qc = useQueryClient();
  const listEq = useServerFn(listEquipamentos);
  const checkDup = useServerFn(checkDuplicidade);
  const criar = useServerFn(criarSolicitacao);
  const extrairOrcamento = useServerFn(extrairItensDeOrcamento);
  const listOsEq = useServerFn(listOsDoEquipamento);
  const orcamentoFileRef = useRef<HTMLInputElement>(null);
  const [importandoOrcamento, setImportandoOrcamento] = useState(false);

  const { data: equipamentos = [], isFetching: carregandoEquipamentos } = useQuery({
    queryKey: ["equipamentos"],
    queryFn: () => listEq(),
    enabled: open,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  // Cabeçalho do lote
  const [equipamentoId, setEquipamentoId] = useState("");
  const [osNumero, setOsNumero] = useState("");
  const [obs, setObs] = useState("");

  // Última OS usada por máquina (persistida no aparelho, por solicitante)
  const lsKey = `ultimaOsPorMaquina:${meId}`;
  const [ultimasOs, setUltimasOs] = useState<Record<string, string>>({});
  useEffect(() => {
    try { setUltimasOs(JSON.parse(localStorage.getItem(lsKey) || "{}")); } catch { /* noop */ }
  }, [lsKey]);
  const ultimaOsMaquina = equipamentoId ? (ultimasOs[equipamentoId] || "") : "";

  // OSs já usadas anteriormente para esta máquina (todas as pessoas)
  const { data: osAnteriores = [] } = useQuery({
    queryKey: ["os-do-equipamento", equipamentoId],
    queryFn: () => listOsEq({ data: { equipamento_id: equipamentoId } }),
    enabled: open && !!equipamentoId,
    staleTime: 60 * 1000,
  });

  // Ao trocar a máquina, sugere a última OS usada nela (se o campo estiver vazio)
  useEffect(() => {
    if (!equipamentoId) return;
    const ult = ultimasOs[equipamentoId] || osAnteriores[0]?.os_numero;
    if (ult && !osNumero.trim()) setOsNumero(ult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipamentoId, osAnteriores]);

  // Itens do lote (formulário + lista)
  const [itens, setItens] = useState<ItemLote[]>([]);
  const [draft, setDraft] = useState<ItemLote>(novoItem());
  const draftFileRef = useRef<HTMLInputElement>(null);
  const [salvando, setSalvando] = useState(false);

  // Alerta de duplicidade
  type DupInfo = {
    itemKey: string;
    lista: ItemLote[];
    anterior: { os_numero: string; created_at: string; descricao: string; codigo_peca: string | null; quantidade: number; status: string };
    justificativa: string;
  };
  const [dup, setDup] = useState<DupInfo | null>(null);

  // Campos obrigatórios em falta (destacados em vermelho na tela)
  const [erros, setErros] = useState<Record<string, boolean>>({});
  const limparErro = (campo: string) => setErros((e) => (e[campo] ? { ...e, [campo]: false } : e));

  const reset = () => {
    setEquipamentoId(""); setOsNumero(""); setObs("");
    setItens([]); setDraft(novoItem()); setDup(null); setErros({});
  };


  const adicionarNaLista = () => {
    const faltando: Record<string, boolean> = {
      codigo_peca: !draft.codigo_peca.trim(),
      descricao: !draft.descricao.trim(),
      quantidade: !(Number(draft.quantidade) > 0),
      equipamento_uso: !!draft.vai_para_outro && !draft.equipamento_uso_id,
    };
    setErros((e) => ({ ...e, ...faltando }));
    if (Object.values(faltando).some(Boolean)) {
      return toast.error("Preencha os campos destacados em vermelho.");
    }
    setItens((xs) => [...xs, draft]);
    setDraft(novoItem());
    if (draftFileRef.current) draftFileRef.current.value = "";
  };

  const removerItem = (key: string) => setItens((xs) => xs.filter((i) => i.key !== key));

  const importarOrcamentoPdf = async (file: File) => {
    if (!file) return;
    const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    const isImg = /^image\//i.test(file.type) || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(file.name);
    if (!isPdf && !isImg) return toast.error("Envie um PDF ou uma imagem (foto) do orçamento.");
    if (file.size > 6 * 1024 * 1024) return toast.error("Arquivo muito grande (máx. 6MB).");
    setImportandoOrcamento(true);
    try {
      const data_base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = String(r.result || "");
          const b64 = s.includes(",") ? s.split(",")[1] : s;
          resolve(b64);
        };
        r.onerror = () => reject(new Error("Falha ao ler o arquivo"));
        r.readAsDataURL(file);
      });
      const mime = file.type || (isPdf ? "application/pdf" : "image/jpeg");
      const { itens: extraidos } = await extrairOrcamento({
        data: { file_name: file.name, mime_type: mime, data_base64 },
      });
      if (!extraidos.length) return toast.error("Nenhuma peça reconhecida no arquivo.");
      const novos: ItemLote[] = extraidos.map((x) => ({
        ...novoItem(),
        codigo_peca: x.codigo_peca,
        descricao: x.descricao,
        quantidade: String(x.quantidade ?? ""),
        unidade: x.unidade || "UN",
      }));
      setItens((xs) => [...xs, ...novos]);
      toast.success(`${novos.length} peça(s) importada(s) do orçamento. Revise antes de enviar.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImportandoOrcamento(false);
      if (orcamentoFileRef.current) orcamentoFileRef.current.value = "";
    }
  };




  const uploadFoto = async (foto: File) => {
    const ext = foto.name.split(".").pop();
    const path = `${meId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("solicitacao-anexos").upload(path, foto, {
      contentType: foto.type || undefined,
      upsert: false,
    });
    if (error) throw error;
    return path;
  };

  // Persiste todas as solicitações da lista atual
  const persistir = async (lista: ItemLote[]) => {
    setSalvando(true);
    try {
      for (const it of lista) {
        const foto_peca_path = it.foto ? await uploadFoto(it.foto) : null;
        await criar({ data: {
          solicitante_id: meId,
          equipamento_id: equipamentoId,
          equipamento_uso_id: it.vai_para_outro ? it.equipamento_uso_id : null,
          vai_para_outro: it.vai_para_outro,
          os_numero: osNumero.trim().toUpperCase(),
          descricao: it.descricao.trim().toUpperCase(),
          codigo_peca: it.codigo_peca.trim().toUpperCase(),
          quantidade: Number(it.quantidade) || 1,
          unidade: (it.unidade || "UN").toUpperCase(),
          urgencia: it.urgencia,
          observacoes_gerais: (() => {
            const partes = [obs.trim(), it.observacao.trim()].filter(Boolean);
            return partes.length ? partes.join(" · ").toUpperCase() : null;
          })(),
          justificativa_duplicidade: it.justificativa_duplicidade.trim() ? it.justificativa_duplicidade.trim().toUpperCase() : null,
          foto_peca_path,
          pode_ser_paralela: it.pode_ser_paralela,
        } });

      }
      // Persiste a última OS usada nessa máquina (no aparelho, por solicitante)
      try {
        const os = osNumero.trim().toUpperCase();
        if (equipamentoId && os) {
          const atual = { ...ultimasOs, [equipamentoId]: os };
          setUltimasOs(atual);
          localStorage.setItem(lsKey, JSON.stringify(atual));
        }
      } catch { /* noop */ }
      toast.success(`${lista.length} peça(s) enviada(s) na OS ${osNumero}. Aguarde a aprovação do supervisor.`);

      qc.invalidateQueries({ queryKey: ["solicitacoes"] });
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  // Verifica duplicidade item-a-item; se achar sem justificativa, abre modal
  const verificarEEnviar = async (lista: ItemLote[]) => {
    setSalvando(true);
    try {
      for (const it of lista) {
        if (it.justificativa_duplicidade.trim()) continue;
        if (!it.codigo_peca.trim() || !equipamentoId) continue;
        const r = await checkDup({ data: { codigo_peca: it.codigo_peca, descricao: it.descricao, equipamento_id: equipamentoId } });
        if (r.encontrou) {
          setSalvando(false);
          setDup({ itemKey: it.key, lista, anterior: r.itens[0] as DupInfo["anterior"], justificativa: "" });
          return;
        }
      }
    } catch (e) {
      setSalvando(false);
      toast.error((e as Error).message);
      return;
    }
    setSalvando(false);
    await persistir(lista);
  };

  const enviarLote = async () => {
    const draftParcial = !!(draft.descricao.trim() || draft.codigo_peca.trim());
    const faltando: Record<string, boolean> = {
      maquina: !equipamentoId,
      os: !osNumero.trim(),
      codigo_peca: draftParcial && !draft.codigo_peca.trim(),
      descricao: draftParcial && !draft.descricao.trim(),
      equipamento_uso: draftParcial && !!draft.vai_para_outro && !draft.equipamento_uso_id,
    };
    setErros(faltando);
    if (Object.values(faltando).some(Boolean)) {
      return toast.error("Faltam campos obrigatórios — veja os destaques em vermelho.");
    }

    let listaFinal = itens;
    const draftPreenchido = draft.descricao.trim() && draft.codigo_peca.trim();
    if (draftPreenchido) {
      listaFinal = [...itens, draft];
      setItens(listaFinal);
      setDraft(novoItem());
      if (draftFileRef.current) draftFileRef.current.value = "";
    }

    if (listaFinal.length === 0) return toast.error("Adicione ao menos 1 item na lista");

    await verificarEEnviar(listaFinal);
  };

  // Handlers do modal de duplicidade
  const prosseguirDup = async () => {
    if (!dup) return;
    if (!dup.justificativa.trim()) return toast.error("Preencha a justificativa para prosseguir");
    const nova = dup.lista.map((x) => x.key === dup.itemKey
      ? { ...x, justificativa_duplicidade: dup.justificativa.trim().toUpperCase() }
      : x);
    setItens(nova);
    setDup(null);
    await verificarEEnviar(nova);
  };

  const cancelarItemDup = async () => {
    if (!dup) return;
    const nova = dup.lista.filter((x) => x.key !== dup.itemKey);
    setItens(nova);
    setDup(null);
    if (nova.length === 0) return toast.info("Solicitação cancelada — lote vazio.");
    await verificarEEnviar(nova);
  };

  const equipSelecionado = useMemo(() => equipamentos.find((e) => e.id === equipamentoId), [equipamentos, equipamentoId]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nova solicitação — lote de peças</DialogTitle>
          <DialogDescription>
            Adicione todas as peças desta OS. Cada item vira uma RC, agrupada pela mesma OS.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          {/* COLUNA ESQUERDA — cabeçalho + item */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">1. Identificação geral</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                <div>
                  <Label className={erros.maquina ? "text-destructive" : ""}>Máquina (custo) *</Label>
                  <div className={erros.maquina ? "rounded-md ring-2 ring-destructive" : ""}>
                    <EquipamentoCombobox equipamentos={equipamentos} value={equipamentoId} onChange={(id) => { setEquipamentoId(id); limparErro("maquina"); }} loading={carregandoEquipamentos} />
                  </div>
                  {erros.maquina && <p className="mt-1 text-xs font-medium text-destructive">Obrigatório: escolha a máquina.</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className={erros.os ? "text-destructive" : ""}>Nº OS *</Label>
                  <Input value={osNumero} onChange={(e) => { setOsNumero(e.target.value.toUpperCase()); limparErro("os"); }} className={`uppercase ${erros.os ? "border-destructive ring-2 ring-destructive" : ""}`} />
                  {erros.os && <p className="mt-1 text-xs font-medium text-destructive">Obrigatório: informe a OS.</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant={osNumero === "OFICINA" ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setOsNumero("OFICINA")}>
                      OFICINA
                    </Button>
                    {osAnteriores
                      .filter((o) => o.os_numero !== "OFICINA")
                      .slice(0, 5)
                      .map((o) => (
                        <Button
                          key={o.os_numero}
                          type="button"
                          size="sm"
                          variant={osNumero === o.os_numero ? "default" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => setOsNumero(o.os_numero)}
                        >
                          {o.os_numero}
                        </Button>
                      ))}
                    {osNumero && (
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOsNumero("")}>
                        Outra OS
                      </Button>
                    )}
                  </div>
                  {equipamentoId && osAnteriores.length === 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">Primeira RC desta máquina — digite a OS; as próximas serão sugeridas.</p>
                  )}
                </div>

                <div>
                  <Label>Observações do pedido</Label>
                  <Input value={obs} onChange={(e) => setObs(e.target.value.toUpperCase())} className="uppercase" />
                </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">2. Adicionar item à lista</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                <div className="rounded-md border border-dashed bg-muted/40 p-3">
                  <div className="mb-2 text-xs">
                    <b>Atalho:</b> tem um PDF ou foto do orçamento? A IA lê o arquivo e preenche a lista automaticamente — depois é só revisar código, quantidade e enviar.
                  </div>
                  <input
                    ref={orcamentoFileRef}
                    type="file"
                    accept="application/pdf,.pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importarOrcamentoPdf(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => orcamentoFileRef.current?.click()}
                    disabled={importandoOrcamento}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {importandoOrcamento ? "Lendo com IA…" : "Importar peças de PDF ou foto do orçamento"}
                  </Button>

                </div>

                <div className="rounded-md border bg-muted/40 p-2">
                  <BuscaMaterialAlmox
                    onSelecionar={({ codigo, descricao }) => {
                      setDraft((d) => ({ ...d, codigo_peca: codigo, descricao }));
                      limparErro("codigo_peca");
                      limparErro("descricao");
                    }}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Opcional. Se não tiver cadastro, preencha o código e a descrição normalmente.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">

                  <div>
                    <Label className={erros.quantidade ? "text-destructive" : ""}>Qtd *</Label>
                    <Input type="number" inputMode="numeric" min={1} value={draft.quantidade}
                      onChange={(e) => { setDraft({ ...draft, quantidade: e.target.value.replace(/[^0-9]/g, "") }); limparErro("quantidade"); }}
                      className={erros.quantidade ? "border-destructive ring-2 ring-destructive" : ""} />
                    {erros.quantidade && <p className="mt-1 text-xs font-medium text-destructive">Obrigatório: informe a qtd.</p>}
                  </div>
                  <div className="col-span-2">
                    <Label className={erros.codigo_peca ? "text-destructive" : ""}>Código original *</Label>
                    <Input value={draft.codigo_peca}
                      onChange={(e) => { setDraft({ ...draft, codigo_peca: e.target.value.toUpperCase() }); limparErro("codigo_peca"); }}
                      className={`uppercase ${erros.codigo_peca ? "border-destructive ring-2 ring-destructive" : ""}`} />
                    {erros.codigo_peca && <p className="mt-1 text-xs font-medium text-destructive">Obrigatório: informe o código.</p>}
                    <MiniEstoqueBadge codigo={draft.codigo_peca} />
                  </div>
                </div>
                <div>
                  <Label className={erros.descricao ? "text-destructive" : ""}>Descrição detalhada *</Label>
                  <Textarea rows={2} value={draft.descricao}
                    onChange={(e) => { setDraft({ ...draft, descricao: e.target.value.toUpperCase() }); limparErro("descricao"); }}
                    className={`uppercase ${erros.descricao ? "border-destructive ring-2 ring-destructive" : ""}`} />
                  {erros.descricao && <p className="mt-1 text-xs font-medium text-destructive">Obrigatório: descreva a peça.</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Urgência</Label>
                    <Select value={draft.urgencia} onValueChange={(v) => setDraft({ ...draft, urgencia: v as ItemLote["urgencia"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BAIXA">Baixa</SelectItem>
                        <SelectItem value="MEDIA">Média</SelectItem>
                        <SelectItem value="ALTA">Alta</SelectItem>
                        <SelectItem value="URGENTE">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Unidade</Label>
                    <Input value={draft.unidade} onChange={(e) => setDraft({ ...draft, unidade: e.target.value.toUpperCase() })} className="uppercase" />
                  </div>
                </div>

                <div>
                  <Label>Esta peça vai para outra máquina?</Label>
                  <div className="mt-1 flex gap-2">
                    <Button type="button" size="sm" variant={draft.vai_para_outro ? "outline" : "default"}
                      onClick={() => setDraft({ ...draft, vai_para_outro: false, equipamento_uso_id: "" })}>
                      Não desviar
                    </Button>
                    <Button type="button" size="sm" variant={draft.vai_para_outro ? "default" : "outline"}
                      onClick={() => setDraft({ ...draft, vai_para_outro: true })}>
                      Desviar
                    </Button>
                  </div>
                  {draft.vai_para_outro && (
                    <div className="mt-2">
                      <Label className={`text-xs ${erros.equipamento_uso ? "text-destructive" : ""}`}>Máquina de uso</Label>
                      <div className={erros.equipamento_uso ? "rounded-md ring-2 ring-destructive" : ""}>
                        <EquipamentoCombobox
                          equipamentos={equipamentos}
                          value={draft.equipamento_uso_id}
                          onChange={(id) => { setDraft({ ...draft, equipamento_uso_id: id }); limparErro("equipamento_uso"); }}
                          loading={carregandoEquipamentos}
                        />
                      </div>
                      {erros.equipamento_uso && <p className="mt-1 text-xs font-medium text-destructive">Obrigatório: escolha a máquina de destino.</p>}
                      <p className="mt-1 text-xs text-muted-foreground">O custo permanece na máquina original.</p>
                    </div>
                  )}
                </div>

                <div className="rounded border p-3">
                  <Label>Pode ser peça paralela?</Label>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" variant={draft.pode_ser_paralela ? "default" : "outline"}
                      onClick={() => setDraft({ ...draft, pode_ser_paralela: true })}>
                      SIM
                    </Button>
                    <Button type="button" size="sm" variant={!draft.pode_ser_paralela ? "destructive" : "outline"}
                      onClick={() => setDraft({ ...draft, pode_ser_paralela: false })}>
                      NÃO
                    </Button>
                  </div>
                </div>

                <div>

                  <Label>
                    Anexo da peça <span className="text-muted-foreground">(opcional — foto, PDF, orçamento, etc.)</span>
                  </Label>
                  <input ref={draftFileRef} type="file" accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                    onChange={(e) => setDraft({ ...draft, foto: e.target.files?.[0] ?? null })} />
                  <Button type="button" variant="outline" className="w-full"
                    onClick={() => draftFileRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> {draft.foto ? draft.foto.name : "Anexar foto / PDF / orçamento"}
                  </Button>
                </div>

                <div>
                  <Label className="text-xs">Observação <span className="text-muted-foreground">(opcional — ex.: verificar se é compatível com peça X)</span></Label>
                  <Input value={draft.observacao}
                    onChange={(e) => setDraft({ ...draft, observacao: e.target.value.toUpperCase() })}
                    className="uppercase" />
                </div>

                <Button onClick={adicionarNaLista} className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Adicionar na lista
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* COLUNA DIREITA — lista + orientações */}
          <div className="space-y-4">
            <Card className="bg-primary text-primary-foreground">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Quadro de orientações</CardTitle></CardHeader>
              <CardContent className="text-xs">
                Adicione todos os materiais necessários para a intervenção desta máquina.
                O seu supervisor aprovará as peças e o PCM tratará de gerar as RCs.
                {equipSelecionado && (
                  <div className="mt-2 rounded bg-black/20 p-2">
                    <div className="font-semibold">{equipSelecionado.prefixo_interno}</div>
                    <div className="opacity-80">{equipSelecionado.descricao}</div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm">Itens no lote</CardTitle>
                <Badge>{itens.length} {itens.length === 1 ? "item" : "itens"}</Badge>
              </CardHeader>
              <CardContent>
                {itens.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    Nenhum item adicionado ainda.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {itens.map((it, idx) => (
                      <li key={it.key} className="rounded border p-2 text-xs space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold">{idx + 1}. {it.descricao}</div>
                            <div className="text-muted-foreground">
                              cód. {it.codigo_peca} · {it.quantidade} {it.unidade} · {it.urgencia}
                              {it.vai_para_outro && " · desvio"}
                              {it.foto && " · 📎"}
                            </div>
                          </div>
                          <button onClick={() => removerItem(it.key)} className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {(it.observacao || it.justificativa_duplicidade) && (
                          <div className="text-[11px] text-muted-foreground space-y-0.5">
                            {it.observacao && <div>📝 {it.observacao}</div>}
                            {it.justificativa_duplicidade && <div>🔁 {it.justificativa_duplicidade}</div>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={enviarLote} disabled={salvando}>
            <AlertTriangle className="mr-2 h-4 w-4 opacity-0" />
            {salvando ? "Enviando..." : `Enviar peça(s) — ${meNome.split(" ")[0]}`}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Modal de alerta de duplicidade */}
      <Dialog open={!!dup} onOpenChange={(v) => { if (!v) setDup(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Peça já solicitada anteriormente
            </DialogTitle>
            <DialogDescription>
              Verifique se essa peça realmente precisa ser comprada novamente.
            </DialogDescription>
          </DialogHeader>
          {dup && (() => {
            const item = dup.lista.find((x) => x.key === dup.itemKey);
            return (
              <div className="space-y-3 text-sm">
                <div className="rounded border bg-muted p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Solicitação anterior:</div>
                  <div className="mt-1"><b>Peça:</b> {dup.anterior.descricao}</div>
                  <div><b>Código:</b> {dup.anterior.codigo_peca ?? "—"}</div>
                  <div><b>OS:</b> {dup.anterior.os_numero} · <b>Qtd:</b> {dup.anterior.quantidade}</div>
                  <div><b>Data:</b> {new Date(dup.anterior.created_at).toLocaleDateString("pt-BR")}</div>
                  <div><b>Status atual:</b> {dup.anterior.status}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Sua nova solicitação:</div>
                  <div className="mt-1">{item?.descricao} · cód. {item?.codigo_peca} · qtd {item?.quantidade}</div>
                </div>
                <div>
                  <Label>Justificativa para prosseguir *</Label>
                  <Textarea rows={3}
                    value={dup.justificativa}
                    onChange={(e) => setDup({ ...dup, justificativa: e.target.value.toUpperCase() })}
                    placeholder="EX: PEÇA ANTERIOR AINDA NÃO CHEGOU / NOVA QUEBRA / MÁQUINA DIFERENTE"
                    className="uppercase" />
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelarItemDup} disabled={salvando}>
              Cancelar esta peça
            </Button>
            <Button onClick={prosseguirDup} disabled={salvando}>
              {salvando ? "Enviando..." : "Prosseguir com a solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// ==================== Material de consumo ====================

type ConsumoRegistro = {
  id: string; material: string; quantidade: number; unidade: string; os_numero: string | null;
  observacao: string | null; created_at: string;
  status?: string | null; reserva_numero?: string | null;
  equipamento?: { id?: string; prefixo_interno: string; codigo_armac: string | null } | null;
};

function BotaoRetirei({ registro, meId }: { registro: ConsumoRegistro; meId: string }) {
  const qc = useQueryClient();
  const confirmar = useServerFn(confirmarRetiradaConsumo);
  const m = useMutation({
    mutationFn: () => confirmar({ data: { id: registro.id, solicitante_id: meId } }),
    onSuccess: () => {
      toast.success("Retirada confirmada!");
      qc.invalidateQueries({ queryKey: ["consumo-materiais"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={m.isPending} onClick={() => m.mutate()}>
      ✅ {m.isPending ? "Confirmando..." : "Retirei do estoque"}
    </Button>
  );
}

function EditarConsumoDialog({
  registro,
  meId,
  equipamentos,
  carregandoEq,
}: {
  registro: ConsumoRegistro;
  meId: string;
  equipamentos: Array<{ id: string; prefixo_interno: string; codigo_armac: string | null; descricao: string | null }>;
  carregandoEq: boolean;
}) {
  const qc = useQueryClient();
  const editar = useServerFn(editarMeuConsumo);
  const [aberto, setAberto] = useState(false);
  const [material, setMaterial] = useState(registro.material);
  const [quantidade, setQuantidade] = useState(String(registro.quantidade));
  const [unidade, setUnidade] = useState(registro.unidade || "UN");
  const [equipamentoId, setEquipamentoId] = useState(registro.equipamento?.id ?? "");
  const [osNumero, setOsNumero] = useState(registro.os_numero ?? "");
  const [observacao, setObservacao] = useState(registro.observacao ?? "");

  const salvar = useMutation({
    mutationFn: () =>
      editar({
        data: {
          id: registro.id,
          solicitante_id: meId,
          material,
          quantidade: Number(quantidade),
          unidade,
          equipamento_id: equipamentoId || null,
          os_numero: osNumero || null,
          observacao: observacao || null,
        },
      }),
    onSuccess: () => {
      toast.success("Registro atualizado!");
      qc.invalidateQueries({ queryKey: ["consumo-materiais"] });
      setAberto(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        ✏️ Editar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar material solicitado</DialogTitle>
            <DialogDescription>
              Você pode corrigir ou completar as informações enquanto o almoxarifado ainda não reservou o material.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <BuscaMaterialAlmox
              label="🔎 Consultar estoque do almoxarifado"
              onSelecionar={({ codigo, descricao }) => setMaterial(`${codigo} - ${descricao}`)}
            />
            <div>
              <Label className="text-xs">Material *</Label>
              <Input value={material} onChange={(e) => setMaterial(e.target.value.toUpperCase())} className="uppercase" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Quantidade *</Label>
                <Input type="number" inputMode="decimal" min={0.01} step="0.01" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Unidade</Label>
                <Input value={unidade} onChange={(e) => setUnidade(e.target.value.toUpperCase())} className="uppercase" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Máquina (opcional)</Label>
              <EquipamentoCombobox
                equipamentos={equipamentos}
                value={equipamentoId}
                onChange={setEquipamentoId}
                loading={carregandoEq}
                placeholder="Selecionar máquina (opcional)..."
              />
            </div>
            <div>
              <Label className="text-xs">OS (opcional)</Label>
              <Input value={osNumero} onChange={(e) => setOsNumero(e.target.value.toUpperCase())} className="uppercase" />
            </div>
            <div>
              <Label className="text-xs">Observação (tamanho, medida, especificação...)</Label>
              <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value.toUpperCase())} className="uppercase" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!material.trim()) return toast.error("Informe o material");
                if (!(Number(quantidade) > 0)) return toast.error("Quantidade inválida");
                salvar.mutate();
              }}
              disabled={salvar.isPending}
            >
              {salvar.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConsumoMaterialTab({ meId }: { meId: string }) {

  const qc = useQueryClient();
  const listEq = useServerFn(listEquipamentos);
  const listConsumo = useServerFn(listMeusConsumos);
  const criarConsumo = useServerFn(criarConsumoMaterial);

  const { data: equipamentos = [], isFetching: carregandoEq } = useQuery({
    queryKey: ["equipamentos"],
    queryFn: () => listEq(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: registros = [] } = useQuery({
    queryKey: ["consumo-materiais", meId],
    queryFn: () => listConsumo({ data: { solicitante_id: meId } }),
    enabled: UUID_RE.test(meId),
  });

  const [material, setMaterial] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("UN");
  const [equipamentoId, setEquipamentoId] = useState("");
  const [osNumero, setOsNumero] = useState("");
  const [observacao, setObservacao] = useState("");

  const salvar = useMutation({
    mutationFn: () =>
      criarConsumo({
        data: {
          solicitante_id: meId,
          equipamento_id: equipamentoId || null,
          os_numero: osNumero || null,
          material,
          quantidade: Number(quantidade),
          unidade,
          observacao: observacao || null,
        },
      }),
    onSuccess: () => {
      toast.success("Material de consumo registrado!");
      setMaterial(""); setQuantidade(""); setUnidade("UN"); setOsNumero(""); setObservacao("");
      qc.invalidateQueries({ queryKey: ["consumo-materiais"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const totalMes = useMemo(() => {
    const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
    return (registros as { created_at: string }[]).filter((r) => new Date(r.created_at) >= ini).length;
  }, [registros]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar material de consumo</CardTitle>
          <CardDescription>
            Graxa, óleo, estopa, luvas, disco de corte... Registre o que foi usado para acompanharmos o consumo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <BuscaMaterialAlmox
                label="🔎 Consultar estoque do almoxarifado"
                onSelecionar={({ codigo, descricao }) => setMaterial(`${codigo} - ${descricao}`)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Material *</Label>
              <Input
                value={material}
                onChange={(e) => setMaterial(e.target.value.toUpperCase())}
                placeholder="Ex.: GRAXA EP2, ÓLEO 15W40, ESTOPA..."
              />

            </div>
            <div>
              <Label>Quantidade *</Label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div>
              <Label>Unidade</Label>
              <Input value={unidade} onChange={(e) => setUnidade(e.target.value.toUpperCase())} placeholder="UN, KG, L, M" />
            </div>
            <div className="sm:col-span-2">
              <Label>Máquina (opcional)</Label>
              <EquipamentoCombobox
                equipamentos={equipamentos}
                value={equipamentoId}
                onChange={setEquipamentoId}
                loading={carregandoEq}
                placeholder="Selecionar máquina (opcional)..."
              />
              {equipamentoId && (
                <button type="button" className="mt-1 text-xs text-muted-foreground underline" onClick={() => setEquipamentoId("")}>
                  limpar máquina
                </button>
              )}
            </div>
            <div>
              <Label>OS (opcional)</Label>
              <Input value={osNumero} onChange={(e) => setOsNumero(e.target.value.toUpperCase())} placeholder="Nº da OS" />
            </div>
            <div className="sm:col-span-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value.toUpperCase())} rows={2} />
            </div>
          </div>
          <Button
            onClick={() => {
              if (!material.trim()) return toast.error("Informe o material");
              if (!(Number(quantidade) > 0)) return toast.error("Quantidade inválida");
              salvar.mutate();
            }}
            disabled={salvar.isPending}
          >
            <Plus className="mr-2 h-4 w-4" /> {salvar.isPending ? "Salvando..." : "Registrar consumo"}
          </Button>
        </CardContent>
      </Card>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Meus registros</h3>
          <Badge variant="secondary">{totalMes} neste mês</Badge>
        </div>
        {registros.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-2 h-6 w-6 opacity-50" />
            Nenhum material de consumo registrado ainda.
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {(registros as ConsumoRegistro[]).map((r) => (
              <div key={r.id} className="rounded border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.material}</span>
                      {(r.status ?? "SOLICITADO") === "SOLICITADO" && <Badge variant="secondary">AGUARDANDO RESERVA (PCM)</Badge>}
                      {r.status === "RESERVADO" && (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">
                          LIBERADO NO ALMOX{r.reserva_numero ? ` · RES ${r.reserva_numero}` : ""}
                        </Badge>
                      )}
                      {r.status === "ENTREGUE" && <Badge variant="outline">ENTREGUE</Badge>}
                      {r.status === "COMPRA" && <Badge className="bg-amber-500 hover:bg-amber-500">EM COMPRA (RC)</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Qtd {r.quantidade} {r.unidade}
                      {r.equipamento ? ` · ${r.equipamento.prefixo_interno}${r.equipamento.codigo_armac ? ` · cod. ${r.equipamento.codigo_armac}` : ""}` : ""}
                      {r.os_numero ? ` · OS ${r.os_numero}` : ""}
                    </div>
                    {r.observacao && <div className="mt-1 text-xs text-muted-foreground">{r.observacao}</div>}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    {(r.status ?? "SOLICITADO") === "SOLICITADO" && (
                      <EditarConsumoDialog
                        registro={r}
                        meId={meId}
                        equipamentos={equipamentos}
                        carregandoEq={carregandoEq}
                      />
                    )}
                    {r.status === "RESERVADO" && <BotaoRetirei registro={r} meId={meId} />}
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
