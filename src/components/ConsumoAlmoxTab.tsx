import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listConsumoMateriais, atualizarConsumoMaterial, gerarRcDoConsumo } from "@/lib/solicitacoes.functions";

type Consumo = {
  id: string;
  material: string;
  quantidade: number;
  unidade: string;
  os_numero: string | null;
  observacao: string | null;
  created_at: string;
  status?: string | null;
  reserva_numero?: string | null;
  solicitante?: { id: string; nome: string } | null;
  equipamento?: { id?: string; prefixo_interno: string; codigo_armac: string | null } | null;
};

type Equip = { id: string; prefixo_interno: string; codigo_armac: string | null; descricao: string | null };

const FILTROS = [
  { key: "SOLICITADO", label: "🕒 Aguardando reserva" },
  { key: "RESERVADO", label: "📦 Reservado" },
  { key: "ENTREGUE", label: "✅ Entregue" },
  { key: "COMPRA", label: "🛒 Virou RC de compra" },
  { key: "CANCELADO", label: "🗑️ Cancelado" },
  { key: "TODOS", label: "Todos" },
] as const;

function CancelarConsumoDialog({ registro, onConfirm, disabled }: { registro: Consumo; onConfirm: (motivo: string) => void; disabled?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        title="Cancelar solicitação"
        disabled={disabled}
        onClick={() => setAberto(true)}
      >
        🗑️
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar solicitação de almoxarifado</DialogTitle>
            <DialogDescription>
              <b>{registro.material}</b> (qtd {registro.quantidade} {registro.unidade}). Informe o motivo — ex.: saiu
              manual sem reserva, não autorizado, não há no estoque.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Motivo do cancelamento</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value.toUpperCase())} className="uppercase" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={!motivo.trim()}
              onClick={() => {
                onConfirm(motivo.trim());
                setAberto(false);
                setMotivo("");
              }}
            >
              Cancelar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GerarRcDialog({ registro, onDone }: { registro: Consumo; onDone: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const gerar = useServerFn(gerarRcDoConsumo);

  const [buscaEq, setBuscaEq] = useState("");
  const [equip, setEquip] = useState<Equip | null>(
    registro.equipamento?.id
      ? {
          id: registro.equipamento.id,
          prefixo_interno: registro.equipamento.prefixo_interno,
          codigo_armac: registro.equipamento.codigo_armac,
          descricao: null,
        }
      : null,
  );
  const [os, setOs] = useState(registro.os_numero ?? "");
  const [codigo, setCodigo] = useState("");
  const [rc, setRc] = useState("");

  const termo = buscaEq.trim();
  const { data: equipamentos = [], isFetching } = useQuery({
    queryKey: ["equip-busca-consumo", termo],
    enabled: aberto && termo.length >= 2,
    queryFn: async () => {
      const like = `%${termo.replace(/[%,()]/g, " ")}%`;
      const { data } = await supabase
        .from("equipamentos")
        .select("id, prefixo_interno, codigo_armac, descricao")
        .eq("ativo", true)
        .or(`prefixo_interno.ilike.${like},codigo_armac.ilike.${like},descricao.ilike.${like}`)
        .order("prefixo_interno")
        .limit(20);
      return (data ?? []) as Equip[];
    },
  });

  const salvar = async () => {
    if (!equip) return toast.error("Selecione a máquina");
    if (!os.trim()) return toast.error("Informe a OS");
    setSalvando(true);
    try {
      await gerar({
        data: { id: registro.id, equipamento_id: equip.id, os_numero: os, codigo_peca: codigo || null, rc_numero: rc || null },
      });
      toast.success("RC gerada na fila de tratativa do PCM");
      setAberto(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAberto(true)}>
        🛒 Gerar RC
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar RC de compra</DialogTitle>
            <DialogDescription>
              Material sem estoque no almoxarifado. Entra na fila de tratativa do PCM como <b>{registro.material}</b>{" "}
              (qtd {registro.quantidade} {registro.unidade}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Máquina</Label>
              {equip ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">
                    {[equip.prefixo_interno, equip.codigo_armac].filter(Boolean).join(" · ")}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setEquip(null)}>Trocar</Button>
                </div>
              ) : (
                <>
                  <Input
                    value={buscaEq}
                    onChange={(e) => setBuscaEq(e.target.value.toUpperCase())}
                    placeholder="Busque por prefixo interno ou cód. Armac"
                    className="uppercase"
                  />
                  {termo.length >= 2 && (
                    <div className="mt-1 max-h-48 overflow-y-auto rounded-md border">
                      {isFetching && <p className="p-2 text-xs text-muted-foreground">Buscando…</p>}
                      {!isFetching && equipamentos.length === 0 && (
                        <p className="p-2 text-xs text-muted-foreground">Nenhuma máquina encontrada.</p>
                      )}
                      {equipamentos.map((eq) => (
                        <button
                          key={eq.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => setEquip(eq)}
                        >
                          <b>{eq.prefixo_interno}</b>{eq.codigo_armac ? ` · ${eq.codigo_armac}` : ""}
                          {eq.descricao ? <span className="block text-xs text-muted-foreground">{eq.descricao}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">OS</Label>
                <Input value={os} onChange={(e) => setOs(e.target.value.toUpperCase())} className="uppercase" />
              </div>
              <div>
                <Label className="text-xs">Código da peça (opcional)</Label>
                <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className="uppercase" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Nº RC (opcional)</Label>
              <Input value={rc} onChange={(e) => setRc(e.target.value.toUpperCase())} className="uppercase" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? "Gerando…" : "Gerar RC"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


export default function ConsumoAlmoxTab() {
  const qc = useQueryClient();
  const listar = useServerFn(listConsumoMateriais);
  const atualizar = useServerFn(atualizarConsumoMaterial);
  const [filtro, setFiltro] = useState<string>("SOLICITADO");
  const [reservas, setReservas] = useState<Record<string, string>>({});

  const { data: registros = [], isFetching } = useQuery({
    queryKey: ["consumo-materiais", "pcm"],
    queryFn: () => listar({ data: { limit: 500 } }) as Promise<Consumo[]>,
  });

  const salvar = useMutation({
    mutationFn: (v: { id: string; status: string; reserva_numero?: string | null; motivo?: string | null }) =>
      atualizar({ data: v }),
    onSuccess: () => {
      toast.success("Registro atualizado");
      qc.invalidateQueries({ queryKey: ["consumo-materiais"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const contagem = useMemo(() => {
    const c: Record<string, number> = { SOLICITADO: 0, RESERVADO: 0, ENTREGUE: 0, COMPRA: 0, CANCELADO: 0, TODOS: registros.length };
    for (const r of registros) c[r.status || "SOLICITADO"] = (c[r.status || "SOLICITADO"] ?? 0) + 1;
    return c;
  }, [registros]);

  const lista = useMemo(
    () => (filtro === "TODOS" ? registros : registros.filter((r) => (r.status || "SOLICITADO") === filtro)),
    [registros, filtro],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">🧰 Material de consumo — reserva no almoxarifado</CardTitle>
          <CardDescription>
            Pedidos de material de consumo enviados pelos mecânicos. Informe o <b>Nº da reserva</b> do almoxarifado
            e depois marque como entregue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filtro === f.key ? "default" : "outline"}
                onClick={() => setFiltro(f.key)}
              >
                {f.label} ({contagem[f.key] ?? 0})
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {isFetching && lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : lista.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum material nesta situação.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {lista.map((r) => {
            const st = r.status || "SOLICITADO";
            return (
              <div key={r.id} className="rounded border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{r.material}</span>
                      <Badge variant={st === "CANCELADO" ? "destructive" : st === "SOLICITADO" ? "secondary" : "default"}>
                        {st === "SOLICITADO" ? "AGUARDANDO RESERVA" : st}
                      </Badge>
                      {r.reserva_numero && <Badge className="bg-emerald-600 hover:bg-emerald-600">RES {r.reserva_numero}</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Qtd {r.quantidade} {r.unidade}
                      {r.solicitante ? ` · ${r.solicitante.nome}` : ""}
                      {r.equipamento ? ` · ${r.equipamento.prefixo_interno}${r.equipamento.codigo_armac ? ` · cod. ${r.equipamento.codigo_armac}` : ""}` : ""}
                      {r.os_numero ? ` · OS ${r.os_numero}` : ""}
                      {` · ${new Date(r.created_at).toLocaleDateString("pt-BR")}`}
                    </div>
                    {r.observacao && <div className="mt-1 text-xs text-muted-foreground">{r.observacao}</div>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {st !== "ENTREGUE" && st !== "COMPRA" && st !== "CANCELADO" && (
                      <GerarRcDialog
                        registro={r}
                        onDone={() => qc.invalidateQueries({ queryKey: ["consumo-materiais"] })}
                      />
                    )}
                    {st !== "ENTREGUE" && st !== "COMPRA" && st !== "CANCELADO" && (


                      <>
                        <Input
                          className="h-9 w-40"
                          placeholder="Nº da reserva"
                          value={reservas[r.id] ?? r.reserva_numero ?? ""}
                          onChange={(e) => setReservas((p) => ({ ...p, [r.id]: e.target.value.toUpperCase() }))}
                        />
                        <Button
                          size="sm"
                          disabled={salvar.isPending}
                          onClick={() =>
                            salvar.mutate({
                              id: r.id,
                              status: "RESERVADO",
                              reserva_numero: reservas[r.id] ?? r.reserva_numero ?? "",
                            })
                          }
                        >
                          📦 Reservar
                        </Button>
                      </>
                    )}
                    {st === "RESERVADO" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={salvar.isPending}
                        onClick={() => salvar.mutate({ id: r.id, status: "ENTREGUE", reserva_numero: r.reserva_numero ?? null })}
                      >
                        ✅ Entregue
                      </Button>
                    )}
                    {st !== "CANCELADO" && st !== "COMPRA" && (
                      <CancelarConsumoDialog
                        registro={r}
                        disabled={salvar.isPending}
                        onConfirm={(motivo) => salvar.mutate({ id: r.id, status: "CANCELADO", motivo })}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
