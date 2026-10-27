import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { criarSolicitacaoPcm } from "@/lib/solicitacoes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type Equip = { id: string; prefixo_interno: string; codigo_armac: string | null; descricao: string | null };

export default function NovaRequisicaoPcm() {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const criar = useServerFn(criarSolicitacaoPcm);

  const hojeISO = new Date().toISOString().slice(0, 10);
  const [buscaEq, setBuscaEq] = useState("");
  const [equip, setEquip] = useState<Equip | null>(null);
  const [solicitanteId, setSolicitanteId] = useState("");
  const [form, setForm] = useState({
    os_numero: "",
    rc_numero: "",
    observacoes_gerais: "",
    data_solicitacao: hojeISO,
  });

  type Item = { descricao: string; codigo_peca: string; quantidade: string; unidade: string };
  const itemVazio: Item = { descricao: "", codigo_peca: "", quantidade: "1", unidade: "UN" };
  const [itens, setItens] = useState<Item[]>([{ ...itemVazio }]);
  const setItem = (i: number, patch: Partial<Item>) =>
    setItens((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const { data: solicitantes = [] } = useQuery({
    queryKey: ["solicitantes-pcm"],
    queryFn: async () => (await supabase.from("solicitantes").select("id, nome").eq("ativo", true).order("nome")).data ?? [],
  });

  const termo = buscaEq.trim();
  const { data: equipamentos = [], isFetching } = useQuery({
    queryKey: ["equip-busca-pcm", termo],
    enabled: termo.length >= 2,
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

  const nomeEquip = useMemo(
    () => (equip ? [equip.prefixo_interno, equip.codigo_armac].filter(Boolean).join(" · ") : ""),
    [equip],
  );

  const [ultimaOs, setUltimaOs] = useState<string | null>(null);
  const selecionarEquip = async (eq: Equip) => {
    setEquip(eq);
    setUltimaOs(null);
    const { data } = await supabase
      .from("solicitacoes")
      .select("os_numero")
      .eq("equipamento_id", eq.id)
      .neq("os_numero", "SEM OS")
      .order("created_at", { ascending: false })
      .limit(1);
    const os = data?.[0]?.os_numero ?? null;
    setUltimaOs(os);
    if (os) setForm((f) => (f.os_numero ? f : { ...f, os_numero: os }));
  };

  const limpar = () => {
    setEquip(null);
    setBuscaEq("");
    setSolicitanteId("");
    setForm({ os_numero: "", rc_numero: "", observacoes_gerais: "", data_solicitacao: hojeISO });
    setItens([{ ...itemVazio }]);
  };

  const salvar = async () => {
    if (!equip) return toast.error("Selecione a máquina");
    if (!solicitanteId) return toast.error("Selecione o solicitante");
    const validos = itens.filter((it) => it.descricao.trim());
    if (validos.length === 0) return toast.error("Informe ao menos um material");
    setSalvando(true);
    try {
      for (const it of validos) {
        await criar({
          data: {
            solicitante_id: solicitanteId,
            equipamento_id: equip.id,
            os_numero: form.os_numero,
            descricao: it.descricao,
            codigo_peca: it.codigo_peca || null,
            quantidade: Number(it.quantidade),
            unidade: it.unidade,
            rc_numero: form.rc_numero || null,
            observacoes_gerais: form.observacoes_gerais || null,
            data_solicitacao: form.data_solicitacao,
          },
        });
      }
      toast.success(`${validos.length} ${validos.length === 1 ? "item lançado" : "itens lançados"} na lista do PCM`);
      qc.invalidateQueries({ queryKey: ["solicitacoes"] });
      limpar();
      setAberto(false);
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      toast.error(`Não foi possível lançar: ${msg}`, { duration: 10000 });
      qc.invalidateQueries({ queryKey: ["solicitacoes"] });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)}>
        <Plus className="mr-1 h-4 w-4" /> Nova requisição (retroativa)
      </Button>

      <Dialog open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) limpar(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova requisição direto no PCM</DialogTitle>
            <DialogDescription>
              Use para itens que não subiram pelo app e já passaram pelo supervisor. Entra direto como <b>RC GERADA</b>, com a data original da solicitação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Máquina</Label>
              {equip ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{nomeEquip}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEquip(null)}>Trocar</Button>
                </div>
              ) : (
                <>
                  <Input value={buscaEq} onChange={(e) => setBuscaEq(e.target.value.toUpperCase())} placeholder="Busque por prefixo interno ou cód. Armac" className="uppercase" />
                  {termo.length >= 2 && (
                    <div className="mt-1 max-h-48 overflow-y-auto rounded-md border">
                      {isFetching && <p className="p-2 text-xs text-muted-foreground">Buscando…</p>}
                      {!isFetching && equipamentos.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nenhuma máquina encontrada.</p>}
                      {equipamentos.map((eq) => (
                        <button key={eq.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => selecionarEquip(eq)}>
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
              <Label className="text-xs">Solicitante</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={solicitanteId}
                onChange={(e) => setSolicitanteId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {solicitantes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">OS</Label>
                <Input value={form.os_numero} onChange={(e) => setForm((f) => ({ ...f, os_numero: e.target.value.toUpperCase() }))} className="uppercase" />
                {equip && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ultimaOs ? <>Última OS da máquina: <b>{ultimaOs}</b></> : "Sem OS anterior nesta máquina"}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Data da solicitação</Label>
                <Input type="date" value={form.data_solicitacao} onChange={(e) => setForm((f) => ({ ...f, data_solicitacao: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs">Itens da requisição</Label>
              {itens.map((it, i) => (
                <div key={i} className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Item {i + 1}</span>
                    {itens.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => setItens((arr) => arr.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={it.descricao}
                    onChange={(e) => setItem(i, { descricao: e.target.value.toUpperCase() })}
                    placeholder="MATERIAL / DESCRIÇÃO"
                    className="uppercase"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={it.codigo_peca} onChange={(e) => setItem(i, { codigo_peca: e.target.value.toUpperCase() })} placeholder="CÓDIGO" className="uppercase" />
                    <Input type="number" min={1} value={it.quantidade} onChange={(e) => setItem(i, { quantidade: e.target.value })} placeholder="Qtd" />
                    <Input value={it.unidade} onChange={(e) => setItem(i, { unidade: e.target.value.toUpperCase() })} placeholder="UN" className="uppercase" />
                  </div>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setItens((arr) => [...arr, { ...itemVazio }])}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar item
              </Button>
            </div>

            <div>
              <Label className="text-xs">Nº RC (opcional)</Label>
              <Input value={form.rc_numero} onChange={(e) => setForm((f) => ({ ...f, rc_numero: e.target.value.toUpperCase() }))} placeholder="EX: RC-2026-0123" className="uppercase" />
            </div>

            <div>
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea rows={2} value={form.observacoes_gerais} onChange={(e) => setForm((f) => ({ ...f, observacoes_gerais: e.target.value.toUpperCase() }))} className="uppercase" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Lançar requisição"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
